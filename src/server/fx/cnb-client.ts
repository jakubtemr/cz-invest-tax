import Decimal from 'decimal.js'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { fxRates } from '../db/schema.js'
import { AppError } from '../errors.js'

const CNB_API_BASE = 'https://api.cnb.cz/cnbapi/exrates/daily'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const REQUEST_TIMEOUT_MS = 15_000

const cnbResponseSchema = z.object({
  rates: z.array(
    z.object({
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      rate: z.number().positive().finite(),
      amount: z.number().int().positive(),
      validFor: z.string(),
    }),
  ),
})

// Daily CNB rates cached in the database. The cache key is the REQUESTED date: on a weekend CNB
// returns the last business day's table, which is exactly the rate the tax conversion has to use.
export class CnbFxClient {
  constructor(
    private readonly db: Db,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  // Crowns per one unit of the currency on that day (CNB quotes e.g. JPY per 100 - already divided).
  async rate(date: string, currency: string): Promise<Decimal> {
    if (!ISO_DATE.test(date)) {
      throw new AppError(`Invalid date for a rate lookup: ${date}`, 'FX_BAD_DATE')
    }
    if (currency === 'CZK') return new Decimal(1)
    // T212 quotes LSE listings in pence; CNB only knows pounds.
    if (currency === 'GBX') return (await this.rate(date, 'GBP')).div(100)

    const cached = await this.lookup(date, currency)
    if (cached) return cached

    // Fetch the day only if it is not cached at all, otherwise a currency CNB does not quote would
    // trigger a fresh, pointless request on every single lookup.
    if (!(await this.dayCached(date))) {
      await this.fetchAndCacheDay(date)
      const fetched = await this.lookup(date, currency)
      if (fetched) return fetched
    }
    throw new AppError(`CNB does not quote ${currency} (date ${date})`, 'FX_RATE_NOT_FOUND')
  }

  // Everything already cached for these days, in one query. A tax year spans every trade and
  // payment date, so asking row by row turns a warm overview into hundreds of round trips.
  // Keys are `date|currency`; misses are left to rate(), which fetches and reports them properly.
  async cachedRates(days: readonly string[]): Promise<Map<string, Decimal>> {
    const found = new Map<string, Decimal>()
    if (days.length === 0) return found
    const rows = await this.db
      .select({ date: fxRates.date, currency: fxRates.currency, rate: fxRates.rate, amount: fxRates.amount })
      .from(fxRates)
      .where(inArray(fxRates.date, [...days]))
    for (const row of rows) {
      const perUnit = new Decimal(row.rate).div(row.amount)
      found.set(`${row.date}|${row.currency}`, perUnit)
      // CNB never quotes pence, so the GBX every LSE listing is priced in is derived here too.
      if (row.currency === 'GBP') found.set(`${row.date}|GBX`, perUnit.div(100))
    }
    return found
  }

  private async lookup(date: string, currency: string): Promise<Decimal | null> {
    const [row] = await this.db
      .select({ rate: fxRates.rate, amount: fxRates.amount })
      .from(fxRates)
      .where(and(eq(fxRates.date, date), eq(fxRates.currency, currency)))
    if (!row) return null
    return new Decimal(row.rate).div(row.amount)
  }

  private async dayCached(date: string): Promise<boolean> {
    const [row] = await this.db.select({ id: fxRates.id }).from(fxRates).where(eq(fxRates.date, date)).limit(1)
    return row != null
  }

  private async fetchAndCacheDay(date: string): Promise<void> {
    const query = new URLSearchParams({ date, lang: 'EN' })
    const response = await this.fetchFn(`${CNB_API_BASE}?${query}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    })
    if (!response.ok) {
      throw new AppError(`CNB rates for ${date}: HTTP ${response.status}`, `FX_HTTP_${response.status}`)
    }
    const body: unknown = await response.json()
    const parsed = cnbResponseSchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError(`CNB rates for ${date}: unexpected response shape`, 'FX_BAD_PAYLOAD', { cause: parsed.error })
    }
    // An empty table is not a missing currency: the day itself has no rates, so every item on that
    // day drops out of the base. The caller has to be able to tell the two apart.
    if (parsed.data.rates.length === 0) {
      throw new AppError(`CNB rates for ${date}: empty table`, 'FX_TABLE_EMPTY')
    }
    await this.db
      .insert(fxRates)
      .values(
        parsed.data.rates.map((rate) => ({
          date,
          currency: rate.currencyCode,
          rate: String(rate.rate),
          amount: rate.amount,
        })),
      )
      .onConflictDoNothing()
  }
}
