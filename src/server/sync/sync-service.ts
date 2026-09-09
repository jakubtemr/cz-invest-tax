import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { accounts, cashTransactions, dividends, instruments, lots, positions, sales, snapshots } from '../db/schema.js'
import type { T212Client } from '../t212/client.js'
import { isMappableOrder, mapDividend, mapOrder, mapPosition, mapTransaction, numToStr } from '../t212/mappers.js'
import type { T212Instrument } from '../t212/schemas.js'
import { countryFromIsin } from '../tax/country.js'

export type T212Api = Pick<
  T212Client,
  'getAccountSummary' | 'getPositions' | 'orderPages' | 'dividendPages' | 'transactionPages'
>

export interface SyncSummary {
  positions: number
  lotsAdded: number
  salesAdded: number
  dividendsAdded: number
  transactionsAdded: number
}

export interface SyncProgress extends SyncSummary {
  phase: 'summary' | 'positions' | 'orders' | 'dividends' | 'transactions'
  pagesFetched: number
}

function emptyProgress(): SyncProgress {
  return {
    phase: 'summary',
    pagesFetched: 0,
    positions: 0,
    lotsAdded: 0,
    salesAdded: 0,
    dividendsAdded: 0,
    transactionsAdded: 0,
  }
}

export const UNKNOWN_INSTRUMENT_CURRENCY = 'UNKNOWN'

export class SyncService {
  private readonly instrumentIds = new Map<string, number>()
  private progress: SyncProgress = emptyProgress()

  constructor(
    private readonly db: Db,
    private readonly api: T212Api,
    private readonly onProgress?: (progress: SyncProgress) => void,
  ) {}

  private report(phase: SyncProgress['phase']): void {
    this.progress = { ...this.progress, phase }
    this.onProgress?.(this.progress)
  }

  async syncT212(): Promise<SyncSummary> {
    this.progress = emptyProgress()
    this.report('summary')
    const summary = await this.api.getAccountSummary()

    const [account] = await this.db
      .insert(accounts)
      .values({ broker: 'T212', externalId: String(summary.id), currency: summary.currency })
      .onConflictDoUpdate({
        target: accounts.broker,
        set: { externalId: String(summary.id), currency: summary.currency },
      })
      .returning({ id: accounts.id, historyBackfilledAt: accounts.historyBackfilledAt })
    const accountId = account!.id
    // The incremental stop (break on a fully known page) is only safe over a complete base: it
    // assumes newest-first order AND that no earlier import stopped halfway.
    const allowIncrementalStop = account!.historyBackfilledAt != null

    const positionCount = await this.syncPositions(accountId)
    this.progress = { ...this.progress, positions: positionCount }
    this.report('positions')
    const { lotsAdded, salesAdded } = await this.importOrders(accountId, allowIncrementalStop)
    const dividendsAdded = await this.importDividends(accountId, allowIncrementalStop)
    const transactionsAdded = await this.importTransactions(accountId, allowIncrementalStop)

    if (!allowIncrementalStop) {
      await this.db.update(accounts).set({ historyBackfilledAt: new Date() }).where(eq(accounts.id, accountId))
    }

    // Snapshot only after a successful run: an interrupted sync must not record a state that
    // never existed.
    const cashParts = [summary.cash.availableToTrade, summary.cash.inPies, summary.cash.reservedForOrders]
    await this.db.insert(snapshots).values({
      accountId,
      currency: summary.currency,
      totalValue: numToStr(summary.totalValue),
      cash: cashParts.every((part) => part == null)
        ? null
        : String(cashParts.reduce<number>((sum, part) => sum + (part ?? 0), 0)),
      invested: numToStr(summary.investments.currentValue),
      unrealizedPnl: numToStr(summary.investments.unrealizedProfitLoss),
      realizedPnl: numToStr(summary.investments.realizedProfitLoss),
    })

    return { positions: positionCount, lotsAdded, salesAdded, dividendsAdded, transactionsAdded }
  }

  private async syncPositions(accountId: number): Promise<number> {
    const apiPositions = await this.api.getPositions()
    const rows: (typeof positions.$inferInsert)[] = []
    for (const position of apiPositions) {
      const instrumentId = await this.ensureInstrument(position.instrument)
      rows.push(mapPosition(position, accountId, instrumentId))
    }
    // Synchronous body: better-sqlite3 statements are in-process calls, not round trips.
    this.db.transaction((tx) => {
      tx.delete(positions)
        .where(and(eq(positions.accountId, accountId), eq(positions.source, 'sync')))
        .run()
      if (rows.length > 0) tx.insert(positions).values(rows).run()
    })
    return rows.length
  }

  private async importOrders(
    accountId: number,
    allowIncrementalStop: boolean,
  ): Promise<{ lotsAdded: number; salesAdded: number }> {
    let lotsAdded = 0
    let salesAdded = 0
    for await (const page of this.api.orderPages()) {
      let mappable = 0
      let insertedOnPage = 0
      for (const item of page) {
        if (!isMappableOrder(item)) continue
        const instrument = item.order?.instrument
        const mapped = mapOrder(
          item,
          accountId,
          instrument ? await this.ensureInstrument(instrument) : await this.ensureTickerOnly(item.order?.ticker),
        )
        if (mapped.kind === 'skip') continue
        mappable += 1
        if (mapped.kind === 'lot') {
          const inserted = await this.db
            .insert(lots)
            .values(mapped.row)
            .onConflictDoNothing()
            .returning({ id: lots.id })
          lotsAdded += inserted.length
          insertedOnPage += inserted.length
        } else {
          const inserted = await this.db
            .insert(sales)
            .values(mapped.row)
            .onConflictDoNothing()
            .returning({ id: sales.id })
          salesAdded += inserted.length
          insertedOnPage += inserted.length
        }
      }
      this.progress = { ...this.progress, pagesFetched: this.progress.pagesFetched + 1, lotsAdded, salesAdded }
      this.report('orders')
      // A whole page of mappable records already in the database means the rest is known too.
      if (allowIncrementalStop && mappable > 0 && insertedOnPage === 0) break
    }
    return { lotsAdded, salesAdded }
  }

  private async importDividends(accountId: number, allowIncrementalStop: boolean): Promise<number> {
    let added = 0
    for await (const page of this.api.dividendPages()) {
      let insertedOnPage = 0
      for (const item of page) {
        const instrumentId = item.instrument
          ? await this.ensureInstrument(item.instrument)
          : await this.ensureTickerOnly(item.ticker)
        const inserted = await this.db
          .insert(dividends)
          .values(mapDividend(item, accountId, instrumentId))
          .onConflictDoNothing()
          .returning({ id: dividends.id })
        insertedOnPage += inserted.length
      }
      added += insertedOnPage
      this.progress = { ...this.progress, pagesFetched: this.progress.pagesFetched + 1, dividendsAdded: added }
      this.report('dividends')
      if (allowIncrementalStop && page.length > 0 && insertedOnPage === 0) break
    }
    return added
  }

  private async importTransactions(accountId: number, allowIncrementalStop: boolean): Promise<number> {
    let added = 0
    for await (const page of this.api.transactionPages()) {
      let insertedOnPage = 0
      for (const item of page) {
        const inserted = await this.db
          .insert(cashTransactions)
          .values(mapTransaction(item, accountId))
          .onConflictDoNothing()
          .returning({ id: cashTransactions.id })
        insertedOnPage += inserted.length
      }
      added += insertedOnPage
      this.progress = { ...this.progress, pagesFetched: this.progress.pagesFetched + 1, transactionsAdded: added }
      this.report('transactions')
      if (allowIncrementalStop && page.length > 0 && insertedOnPage === 0) break
    }
    return added
  }

  private async ensureInstrument(instrument: T212Instrument): Promise<number> {
    const cached = this.instrumentIds.get(instrument.ticker)
    if (cached) return cached
    const [row] = await this.db
      .insert(instruments)
      .values({
        ticker: instrument.ticker,
        name: instrument.name ?? null,
        isin: instrument.isin ?? null,
        currency: instrument.currency,
        country: countryFromIsin(instrument.isin),
      })
      .onConflictDoUpdate({
        target: instruments.ticker,
        // coalesce: fresh metadata only fills gaps, it never overwrites with NULL - and country
        // stays put once set, because a hand-picked source state outranks the ISIN prefix.
        set: {
          name: sql`coalesce(excluded.name, ${instruments.name})`,
          isin: sql`coalesce(excluded.isin, ${instruments.isin})`,
          currency: instrument.currency,
          country: sql`coalesce(${instruments.country}, excluded.country)`,
        },
      })
      .returning({ id: instruments.id })
    this.instrumentIds.set(instrument.ticker, row!.id)
    return row!.id
  }

  // Finds or creates an instrument by ticker only - never overwrites existing metadata with UNKNOWN.
  private async ensureTickerOnly(ticker: string | null | undefined): Promise<number> {
    const key = ticker ?? 'UNKNOWN_TICKER'
    const cached = this.instrumentIds.get(key)
    if (cached) return cached
    const existing = await this.db.select({ id: instruments.id }).from(instruments).where(eq(instruments.ticker, key))
    if (existing[0]) {
      this.instrumentIds.set(key, existing[0].id)
      return existing[0].id
    }
    // onConflictDoNothing: a concurrent sync may have inserted the ticker between select and insert
    const [inserted] = await this.db
      .insert(instruments)
      .values({ ticker: key, currency: UNKNOWN_INSTRUMENT_CURRENCY })
      .onConflictDoNothing()
      .returning({ id: instruments.id })
    const id =
      inserted?.id ??
      (await this.db.select({ id: instruments.id }).from(instruments).where(eq(instruments.ticker, key)))[0]!.id
    this.instrumentIds.set(key, id)
    return id
  }
}
