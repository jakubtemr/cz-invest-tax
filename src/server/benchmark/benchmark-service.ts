import Decimal from 'decimal.js'
import { asc, desc, gte, inArray, sql } from 'drizzle-orm'
import { pragueDay } from '../../shared/dates.js'
import type { Db } from '../db/client.js'
import { accounts, benchmarkPrices, cashTransactions, positions, snapshots } from '../db/schema.js'
import type { CnbFxClient } from '../fx/cnb-client.js'
import { loadRates, type RateLookup, RateRequests } from '../tax/fx-lookup.js'
import { type BenchmarkComparison, compareToBenchmark, type ExternalFlow } from './compare.js'
import { closeOnOrBefore } from './price-series.js'
import type { BenchmarkPriceSource } from './yahoo-client.js'

// Money that crossed the brokerage boundary. Interest, fees, dividends and trades are what the
// portfolio did with the money - they are the return being measured, not a flow.
const EXTERNAL_FLOW_TYPES = ['DEPOSIT', 'WITHDRAW', 'TRANSFER']
// Enough sessions before the first deposit to always find a close on or before it.
const LEAD_DAYS = 7
const MS_PER_DAY = 24 * 60 * 60 * 1000
const USD = 'USD'

export type BenchmarkSummary =
  | { readonly status: 'noFlows' }
  | { readonly status: 'noValuation' }
  | ({ readonly status: 'ready' } & BenchmarkComparison)

interface Valuation {
  readonly asOf: string
  readonly amounts: readonly { readonly amount: Decimal; readonly currency: string }[]
}

function daysBefore(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - days * MS_PER_DAY).toISOString().slice(0, 10)
}

const noon = (day: string) => new Date(`${day}T12:00:00Z`)

export class BenchmarkService {
  // The valuation day this process last fetched through: a snapshot taken on a weekend sits
  // after the last close, and without this every overview would go out again.
  private refreshedThrough: string | null = null

  constructor(
    private readonly db: Db,
    private readonly source: BenchmarkPriceSource,
    private readonly fx: CnbFxClient,
  ) {}

  async summary(): Promise<BenchmarkSummary> {
    const flowRows = await this.db
      .select()
      .from(cashTransactions)
      .where(inArray(cashTransactions.type, EXTERNAL_FLOW_TYPES))
      .orderBy(asc(cashTransactions.occurredAt))
    if (flowRows.length === 0) return { status: 'noFlows' }

    const valuation = await this.valuation()
    if (!valuation) return { status: 'noValuation' }

    const since = pragueDay(flowRows[0]!.occurredAt)
    const rate = await this.rates(flowRows, valuation)
    const flows = flowRows.map(
      (row): ExternalFlow => ({
        day: pragueDay(row.occurredAt),
        amountCzk: new Decimal(row.amount).times(rate(row.occurredAt, row.currency) ?? Number.NaN),
      }),
    )
    const portfolioValueCzk = valuation.amounts.reduce(
      (sum, item) => sum.plus(item.amount.times(rate(noon(valuation.asOf), item.currency) ?? Number.NaN)),
      new Decimal(0),
    )

    const closes = await this.closes(since, valuation.asOf)
    return {
      status: 'ready',
      ...compareToBenchmark({
        flows,
        portfolioValueCzk,
        asOf: valuation.asOf,
        closeOn: closeOnOrBefore(closes),
        usdRate: (day) => rate(noon(day), USD),
      }),
    }
  }

  // The latest snapshot per account, or the priced positions of an account that has never been
  // synced (manual Freedom24). The valuation day is the newest snapshot's.
  private async valuation(): Promise<Valuation | null> {
    const [accountRows, snapshotRows, positionRows] = await Promise.all([
      this.db.select({ id: accounts.id, currency: accounts.currency }).from(accounts),
      this.db.select().from(snapshots).orderBy(desc(snapshots.takenAt)),
      this.db.select().from(positions),
    ])
    const latest = accountRows.map((account) => snapshotRows.find((row) => row.accountId === account.id) ?? null)
    const asOfMs = Math.max(...latest.map((row) => row?.takenAt.getTime() ?? 0))
    if (asOfMs === 0) return null

    const amounts = accountRows.flatMap((account, index) => {
      const snapshot = latest[index]
      if (snapshot?.totalValue != null)
        return [{ amount: new Decimal(snapshot.totalValue), currency: snapshot.currency }]
      return positionRows
        .filter((row) => row.accountId === account.id && row.currentValue != null)
        .map((row) => ({ amount: new Decimal(row.currentValue!), currency: row.valueCurrency ?? account.currency }))
    })
    return { asOf: pragueDay(new Date(asOfMs)), amounts }
  }

  private async rates(
    flowRows: readonly (typeof cashTransactions.$inferSelect)[],
    valuation: Valuation,
  ): Promise<RateLookup> {
    const requests = new RateRequests()
    for (const row of flowRows) {
      requests.add(row.occurredAt, row.currency)
      requests.add(row.occurredAt, USD)
    }
    for (const item of valuation.amounts) requests.add(noon(valuation.asOf), item.currency)
    requests.add(noon(valuation.asOf), USD)
    const loaded = await loadRates(this.fx, requests)
    // compareToBenchmark names the missing day itself; a warning here would just repeat it.
    return loaded.rate
  }

  // The cache has to hold a close on or before the first deposit and reach the valuation day;
  // anything short of that is refetched whole - a few thousand rows - and the running close of an
  // open session is overwritten by the final one on the next pass.
  private async closes(since: string, asOf: string) {
    const from = daysBefore(since, LEAD_DAYS)
    const [bounds] = await this.db
      .select({
        first: sql<string | null>`min(${benchmarkPrices.date})`,
        last: sql<string | null>`max(${benchmarkPrices.date})`,
      })
      .from(benchmarkPrices)
    const reachesStart = bounds?.first != null && bounds.first <= since
    const reachesEnd = (bounds?.last != null && bounds.last >= asOf) || (this.refreshedThrough ?? '') >= asOf
    if (!reachesStart || !reachesEnd) {
      const fetched = await this.source.dailyCloses(from, asOf)
      if (fetched.length > 0) {
        await this.db
          .insert(benchmarkPrices)
          .values(fetched.map((row) => ({ date: row.day, close: row.close })))
          .onConflictDoUpdate({ target: benchmarkPrices.date, set: { close: sql`excluded.close` } })
      }
      this.refreshedThrough = asOf
    }
    return this.db
      .select({ day: benchmarkPrices.date, close: benchmarkPrices.close })
      .from(benchmarkPrices)
      .where(gte(benchmarkPrices.date, from))
      .orderBy(asc(benchmarkPrices.date))
  }
}
