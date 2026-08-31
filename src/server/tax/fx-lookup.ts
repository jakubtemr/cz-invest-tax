import type Decimal from 'decimal.js'
import { pragueDay } from '../../shared/dates.js'
import { AppError } from '../errors.js'
import type { CnbFxClient } from '../fx/cnb-client.js'
import { type TaxWarning, warn } from './warnings.js'

// CNB rates are fetched up front so the tax math can stay synchronous. Everything already in the
// cache is read in a single query; only the gaps go to the API, grouped BY DAY rather than by
// (day, currency), because one call brings the whole day's table.

// Czech crowns per one unit, or null when the rate could not be established.
export type RateLookup = (date: Date, currency: string) => Decimal | null

export interface LoadedRates {
  readonly rate: RateLookup
  readonly warnings: readonly TaxWarning[]
}

// Uncached days run in small parallel batches; currencies inside a day run in sequence so the
// first one populates the cache for the rest.
const DAY_CHUNK = 4

export class RateRequests {
  private readonly byDay = new Map<string, Set<string>>()

  add(date: Date, currency: string): void {
    const day = pragueDay(date)
    const currencies = this.byDay.get(day) ?? new Set<string>()
    currencies.add(currency)
    this.byDay.set(day, currencies)
  }

  entries(): [string, Set<string>][] {
    return [...this.byDay]
  }
}

export async function loadRates(fx: CnbFxClient, requests: RateRequests): Promise<LoadedRates> {
  const rates = new Map<string, Decimal>()
  // A currency CNB does not quote at all is a different problem from a day whose table could not
  // be read - one is a permanent gap, the other is an outage that leaves the base incomplete.
  const unquoted = new Set<string>()
  const unavailable = new Set<string>()

  const days = requests.entries()
  // One query for everything already cached, then only the gaps go through rate() one at a time.
  const cached = await fx.cachedRates(days.map(([day]) => day))
  const missing = days
    .map(([day, currencies]) => {
      const gaps = [...currencies].filter((currency) => {
        const hit = cached.get(`${day}|${currency}`)
        if (hit) rates.set(`${day}|${currency}`, hit)
        return !hit
      })
      return [day, gaps] as const
    })
    .filter(([, gaps]) => gaps.length > 0)

  for (let i = 0; i < missing.length; i += DAY_CHUNK) {
    await Promise.all(
      missing.slice(i, i + DAY_CHUNK).map(async ([day, currencies]) => {
        for (const currency of currencies) {
          try {
            rates.set(`${day}|${currency}`, await fx.rate(day, currency))
          } catch (error) {
            if (error instanceof AppError && error.code === 'FX_RATE_NOT_FOUND') unquoted.add(currency)
            else if (error instanceof AppError && error.code === 'FX_TABLE_EMPTY') unavailable.add(day)
            else throw error
          }
        }
      }),
    )
  }

  return {
    rate: (date, currency) => rates.get(`${pragueDay(date)}|${currency}`) ?? null,
    warnings: [
      ...[...unquoted].map((currency) => warn('fxCurrencyUnquoted', { currency })),
      ...[...unavailable].map((day) => warn('fxRateUnavailable', { day }, 'error')),
    ],
  }
}
