import Decimal from 'decimal.js'
import type { MatchedPart, SaleMatch } from './fifo.js'
import type { FxLookup, SaleRow } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

export interface SalesBreakdown {
  readonly exemptByTimeTest: Decimal
  readonly taxableProceeds: Decimal
  readonly taxableCost: Decimal
  readonly sales: SaleRow[]
}

// A fee belongs to the whole lot or the whole sale, so only the matched share of it is a cost of
// this particular part (s. 10(5): expenses demonstrably incurred on acquisition and on the sale).
function feeShare(
  fee: string | null,
  feeCurrency: string | null,
  quantity: string,
  total: string,
  on: Date,
  fx: FxLookup,
): Decimal {
  const totalQuantity = new Decimal(total)
  if (fee === null || feeCurrency === null || totalQuantity.lte(0)) return new Decimal(0)
  return new Decimal(fee).times(quantity).div(totalQuantity).times(fx(on, feeCurrency))
}

function partCost(part: MatchedPart, match: SaleMatch, fx: FxLookup): { cost: Decimal; fee: Decimal } {
  const fee = feeShare(part.lotFee, part.lotFeeCurrency, part.quantity, part.lotQuantity, part.acquiredAt, fx).plus(
    feeShare(match.fee, match.feeCurrency, part.quantity, match.quantity, match.soldAt, fx),
  )
  const price = new Decimal(part.lotPricePerShare).times(part.quantity).times(fx(part.acquiredAt, part.lotCurrency))
  return { cost: price.plus(fee), fee }
}

export function splitSales(
  matches: readonly SaleMatch[],
  fx: FxLookup,
  under100k: boolean,
  warnings: TaxWarning[],
): SalesBreakdown {
  let exemptByTimeTest = new Decimal(0)
  let taxableProceeds = new Decimal(0)
  let taxableCost = new Decimal(0)
  const currencyMismatches = new Set<string>()
  const sales: SaleRow[] = []

  for (const match of matches) {
    const saleRate = fx(match.soldAt, match.currency)
    const price = new Decimal(match.salePricePerShare)
    for (const part of match.parts) {
      if (part.lotCurrency !== match.currency) currencyMismatches.add(match.instrumentKey)
      const proceeds = price.times(part.quantity).times(saleRate)
      const { cost, fee } = partCost(part, match, fx)
      const taxable = !under100k && !part.timeTestMet
      if (part.timeTestMet) exemptByTimeTest = exemptByTimeTest.plus(proceeds)
      if (taxable) {
        taxableProceeds = taxableProceeds.plus(proceeds)
        taxableCost = taxableCost.plus(cost)
      }
      sales.push(row(match, part.lotId, part.quantity, proceeds, cost, fee, part.timeTestMet, taxable))
    }

    const unmatched = new Decimal(match.unmatchedQuantity)
    if (unmatched.gt(0)) {
      const proceeds = price.times(unmatched).times(saleRate)
      const fee = feeShare(match.fee, match.feeCurrency, match.unmatchedQuantity, match.quantity, match.soldAt, fx)
      const taxable = !under100k
      if (taxable) {
        taxableProceeds = taxableProceeds.plus(proceeds)
        taxableCost = taxableCost.plus(fee)
      }
      sales.push(row(match, 0, match.unmatchedQuantity, proceeds, fee, fee, false, taxable))
    }
  }

  for (const instrumentKey of currencyMismatches) {
    warnings.push(warn('currencyMismatch', { instrument: instrumentKey }))
  }

  return { exemptByTimeTest, taxableProceeds, taxableCost, sales }
}

function row(
  match: SaleMatch,
  lotId: number,
  quantity: string,
  proceeds: Decimal,
  cost: Decimal,
  fee: Decimal,
  timeTestMet: boolean,
  taxable: boolean,
): SaleRow {
  return {
    saleId: match.saleId,
    lotId,
    instrumentKey: match.instrumentKey,
    soldAt: match.soldAt,
    quantity,
    proceedsCzk: proceeds.toFixed(2),
    costCzk: cost.toFixed(2),
    feeCzk: fee.toFixed(2),
    gainCzk: proceeds.minus(cost).toFixed(2),
    timeTestMet,
    taxable,
  }
}
