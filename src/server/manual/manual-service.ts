import { randomUUID } from 'node:crypto'
import Decimal from 'decimal.js'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { accounts, instruments, lots, positions, sales } from '../db/schema.js'
import { AppError } from '../errors.js'
import { isCountryCode, UNKNOWN_COUNTRY } from '../tax/country.js'
import { fifoMatch } from '../tax/fifo.js'
import { toTaxLot, toTaxSale } from '../tax/rows.js'

// A Freedom24 account holds positions in the currency of each lot; the per-account aggregate has
// no single currency of its own.
const F24_ACCOUNT_CURRENCY = 'MULTI'

const zero = (): Decimal => new Decimal(0)

// Current value and unrealised P/L, or nulls while no price has been entered. One place, because
// both entering a price and re-aggregating the lots have to reach the same numbers.
function valuation(
  quantity: string,
  currentPrice: string | null,
  totalCost: string | null,
): { currentValue: string | null; unrealizedPnl: string | null } {
  if (currentPrice === null) return { currentValue: null, unrealizedPnl: null }
  const value = new Decimal(quantity).times(currentPrice)
  return {
    currentValue: value.toString(),
    unrealizedPnl: totalCost === null ? null : value.minus(totalCost).toString(),
  }
}

export interface AddLotInput {
  readonly ticker: string
  readonly name?: string | null
  readonly currency: string
  readonly quantity: string
  readonly pricePerShare: string
  readonly acquiredAt: Date
  // T212 is only for patching a hole in the imported history (a missing reinvestment and such).
  readonly broker?: 'F24' | 'T212'
}

export interface TransferRemainderInput {
  readonly fromTicker: string
  readonly toTicker: string
  // Omitted means the whole unmatched remainder.
  readonly quantity?: string | null
}

export class ManualService {
  constructor(private readonly db: Db) {}

  async addLot(input: AddLotInput): Promise<{ lotId: number; instrumentId: number }> {
    const broker = input.broker ?? 'F24'
    const accountId = broker === 'F24' ? await this.ensureF24Account() : await this.requireT212Account()
    await this.assertCurrencyMatchesExistingLots(input.ticker, input.currency)

    const [instrument] = await this.db
      .insert(instruments)
      .values({ ticker: input.ticker, name: input.name ?? null, currency: input.currency })
      .onConflictDoUpdate({
        target: instruments.ticker,
        // coalesce: an empty name on a follow-up purchase must not erase the name entered before
        set: { name: sql`coalesce(excluded.name, ${instruments.name})`, currency: input.currency },
      })
      .returning({ id: instruments.id })
    const instrumentId = instrument!.id

    const [lot] = await this.db
      .insert(lots)
      .values({
        accountId,
        instrumentId,
        quantity: input.quantity,
        pricePerShare: input.pricePerShare,
        currency: input.currency,
        acquiredAt: input.acquiredAt,
        reference: `manual-${randomUUID()}`,
        source: 'manual',
      })
      .returning({ id: lots.id })

    // T212 positions come from the sync and are the source of truth - never overwrite them.
    if (broker === 'F24') await this.recomputePosition(accountId, instrumentId)
    return { lotId: lot!.id, instrumentId }
  }

  // Patches a hole left by a corporate action (ticker change, spin-off): moves the unmatched FIFO
  // remainder onto another ticker KEEPING the acquisition date and price, so the time test runs on.
  async transferRemainder(input: TransferRemainderInput): Promise<{ moved: string; createdLots: number }> {
    const [from] = await this.db.select().from(instruments).where(eq(instruments.ticker, input.fromTicker))
    if (!from) throw new AppError(`Instrument ${input.fromTicker} does not exist`, 'INSTRUMENT_NOT_FOUND')

    const fromLots = await this.db.select().from(lots).where(eq(lots.instrumentId, from.id))
    const fromSales = await this.db.select().from(sales).where(eq(sales.instrumentId, from.id))
    const lotRowById = new Map(fromLots.map((row) => [row.id, row]))

    // The same FIFO the tax module uses: one matching rule for the whole app, per instrument.
    const openParts = fifoMatch(fromLots.map(toTaxLot), fromSales.map(toTaxSale)).openLots
    const available = openParts.reduce((sum, part) => sum.plus(part.remainingQuantity), new Decimal(0))
    const want = input.quantity ? new Decimal(input.quantity) : available
    if (want.lte(0) || want.gt(available)) {
      throw new AppError(
        `${input.fromTicker} has an unmatched remainder of ${available.toString()}, cannot move ${want.toString()}`,
        'INSUFFICIENT_REMAINDER',
      )
    }

    const toId = await this.ensureTargetInstrument(input.toTicker, from)
    let createdLots = 0
    // The transaction body is synchronous: better-sqlite3 runs in-process, so a statement is a
    // function call rather than a round trip, and it refuses an async callback for that reason.
    this.db.transaction((tx) => {
      let left = want
      for (const part of openParts) {
        if (left.lte(0)) break
        const take = Decimal.min(part.remainingQuantity, left)
        left = left.minus(take)
        const original = lotRowById.get(part.lotId)!
        tx.update(lots)
          .set({ quantity: new Decimal(original.quantity).minus(take).toString() })
          .where(eq(lots.id, part.lotId))
          .run()
        tx.insert(lots)
          .values({
            accountId: original.accountId,
            instrumentId: toId,
            quantity: take.toString(),
            pricePerShare: original.pricePerShare,
            currency: original.currency,
            acquiredAt: original.acquiredAt,
            reference: `transfer-${randomUUID()}`,
            source: 'manual',
            raw: { transferredFromLot: part.lotId, transferredFromTicker: input.fromTicker },
          })
          .run()
        createdLots += 1
      }
      // Emptied lots are NOT deleted: a full re-sync would restore a deleted sync lot at full size
      // (idempotence works through the unique reference - an existing row is never rewritten).
    })

    return { moved: want.toString(), createdLots }
  }

  async removeLot(lotId: number): Promise<void> {
    const [removed] = await this.db
      .delete(lots)
      .where(and(eq(lots.id, lotId), eq(lots.source, 'manual')))
      .returning({ accountId: lots.accountId, instrumentId: lots.instrumentId })
    if (!removed) throw new AppError(`Manual lot ${lotId} not found`, 'LOT_NOT_FOUND')
    // The aggregate position is only recomputed for F24 - T212 positions belong to the sync.
    const [account] = await this.db
      .select({ broker: accounts.broker })
      .from(accounts)
      .where(eq(accounts.id, removed.accountId))
    if (account?.broker === 'F24') await this.recomputePosition(removed.accountId, removed.instrumentId)
  }

  async setPrice(instrumentId: number, currentPrice: string): Promise<void> {
    const [account] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.broker, 'F24'))
    if (!account) throw new AppError(`Manual position for instrument ${instrumentId} not found`, 'POSITION_NOT_FOUND')
    const [position] = await this.db
      .select()
      .from(positions)
      .where(and(eq(positions.accountId, account.id), eq(positions.instrumentId, instrumentId)))
    if (!position) throw new AppError(`Manual position for instrument ${instrumentId} not found`, 'POSITION_NOT_FOUND')

    await this.db
      .update(positions)
      .set({ currentPrice, ...valuation(position.quantity, currentPrice, position.totalCost), syncedAt: new Date() })
      .where(eq(positions.id, position.id))
  }

  // The ISIN prefix is a default, not a verdict: an ADR or an ETF is registered somewhere other
  // than where its dividend is taxed, so the source state has to be correctable by hand.
  async setCountry(instrumentId: number, country: string): Promise<void> {
    const normalised = country.trim().toUpperCase()
    if (normalised !== UNKNOWN_COUNTRY && !isCountryCode(normalised)) {
      throw new AppError(`${country} is not an ISO 3166-1 alpha-2 country code`, 'COUNTRY_INVALID')
    }
    const [updated] = await this.db
      .update(instruments)
      .set({ country: normalised })
      .where(eq(instruments.id, instrumentId))
      .returning({ id: instruments.id })
    if (!updated) throw new AppError(`Instrument ${instrumentId} not found`, 'INSTRUMENT_NOT_FOUND')
  }

  private async ensureTargetInstrument(ticker: string, from: typeof instruments.$inferSelect): Promise<number> {
    const [inserted] = await this.db
      .insert(instruments)
      .values({ ticker, currency: from.currency, name: from.name, isin: from.isin, country: from.country })
      .onConflictDoNothing()
      .returning({ id: instruments.id })
    if (inserted) return inserted.id
    const [existing] = await this.db
      .select({ id: instruments.id })
      .from(instruments)
      .where(eq(instruments.ticker, ticker))
    return existing!.id
  }

  // Lots of one instrument must share a currency, otherwise the aggregate would add up units that
  // are not comparable.
  private async assertCurrencyMatchesExistingLots(ticker: string, currency: string): Promise<void> {
    const [existing] = await this.db
      .select({ currency: lots.currency })
      .from(lots)
      .innerJoin(instruments, eq(lots.instrumentId, instruments.id))
      .where(eq(instruments.ticker, ticker))
      .limit(1)
    if (existing && existing.currency !== currency) {
      throw new AppError(
        `Existing purchases of ${ticker} are in ${existing.currency}, a lot in ${currency} cannot be added`,
        'CURRENCY_MISMATCH',
      )
    }
  }

  private async requireT212Account(): Promise<number> {
    const [account] = await this.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.broker, 'T212'))
    if (!account) {
      throw new AppError('No T212 account yet - run the sync on the Portfolio screen first', 'T212_ACCOUNT_NOT_FOUND')
    }
    return account.id
  }

  private async ensureF24Account(): Promise<number> {
    const [account] = await this.db
      .insert(accounts)
      .values({ broker: 'F24', currency: F24_ACCOUNT_CURRENCY })
      .onConflictDoUpdate({ target: accounts.broker, set: { currency: F24_ACCOUNT_CURRENCY } })
      .returning({ id: accounts.id })
    return account!.id
  }

  // A position is the aggregate of its lots: total quantity and the weighted average price. The
  // arithmetic is decimal.js, never SQL - SQLite has no exact decimal and money must not meet a float.
  private async recomputePosition(accountId: number, instrumentId: number): Promise<void> {
    const rows = await this.db
      .select()
      .from(lots)
      .where(and(eq(lots.accountId, accountId), eq(lots.instrumentId, instrumentId)))

    const quantity = rows.reduce((sum, lot) => sum.plus(lot.quantity), new Decimal(0))
    if (quantity.isZero()) {
      await this.db
        .delete(positions)
        .where(and(eq(positions.accountId, accountId), eq(positions.instrumentId, instrumentId)))
      return
    }

    const totalCost = rows.reduce((sum, lot) => sum.plus(new Decimal(lot.quantity).times(lot.pricePerShare)), zero())
    const [existing] = await this.db
      .select({ currentPrice: positions.currentPrice })
      .from(positions)
      .where(and(eq(positions.accountId, accountId), eq(positions.instrumentId, instrumentId)))

    const row = {
      quantity: quantity.toString(),
      averagePrice: totalCost.div(quantity).toString(),
      totalCost: totalCost.toString(),
      // Lots of one instrument share a currency, so the first one speaks for the aggregate.
      valueCurrency: rows[0]!.currency,
      source: 'manual' as const,
      syncedAt: new Date(),
      ...valuation(quantity.toString(), existing?.currentPrice ?? null, totalCost.toString()),
    }

    await this.db
      .insert(positions)
      .values({ accountId, instrumentId, ...row })
      .onConflictDoUpdate({ target: [positions.accountId, positions.instrumentId], set: row })
  }
}
