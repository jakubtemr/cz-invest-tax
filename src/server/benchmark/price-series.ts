import Decimal from 'decimal.js'
import type { DayLookup } from './compare.js'
import type { IndexClose } from './yahoo-client.js'

// A deposit made on a weekend or a market holiday buys at the last close before it.
export function closeOnOrBefore(sorted: readonly IndexClose[]): DayLookup {
  return (day) => {
    let low = 0
    let high = sorted.length - 1
    let found: IndexClose | null = null
    while (low <= high) {
      const mid = (low + high) >> 1
      const row = sorted[mid]!
      if (row.day <= day) {
        found = row
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return found ? new Decimal(found.close) : null
  }
}
