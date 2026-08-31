import Decimal from 'decimal.js'
import { pragueDay } from '../../shared/dates.js'
import type { SaleMatch } from './fifo.js'
import type { FxLookup } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

export interface Proceeds {
  // Every sale of the year, exempt or not.
  readonly all: Decimal
  // What the s. 4(1)(w) limit is measured against: sales already exempt under the time test do
  // not consume the limit. An unmatched quantity does, because its exemption cannot be proven.
  readonly limit: Decimal
}

export function sumProceeds(matches: readonly SaleMatch[], fx: FxLookup, warnings: TaxWarning[]): Proceeds {
  let all = new Decimal(0)
  let limit = new Decimal(0)

  for (const match of matches) {
    const rate = fx(match.soldAt, match.currency)
    const price = new Decimal(match.salePricePerShare)
    for (const part of match.parts) {
      const proceeds = price.times(part.quantity).times(rate)
      all = all.plus(proceeds)
      if (!part.timeTestMet) limit = limit.plus(proceeds)
    }

    const unmatched = new Decimal(match.unmatchedQuantity)
    if (unmatched.gt(0)) {
      const proceeds = price.times(unmatched).times(rate)
      all = all.plus(proceeds)
      limit = limit.plus(proceeds)
      warnings.push(
        warn(
          'unmatchedSale',
          {
            instrument: match.instrumentKey,
            day: pragueDay(match.soldAt),
            quantity: match.unmatchedQuantity,
          },
          'error',
        ),
      )
    }
  }

  return { all, limit }
}
