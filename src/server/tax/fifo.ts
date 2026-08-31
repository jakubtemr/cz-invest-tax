import Decimal from 'decimal.js'
import { addYearsToDay, nextDay, pragueDay } from '../../shared/dates.js'

export interface TaxLot {
  readonly lotId: number
  readonly quantity: string
  readonly pricePerShare: string
  readonly currency: string
  readonly acquiredAt: Date
  readonly fee: string | null
  readonly feeCurrency: string | null
}

export interface TaxSale {
  readonly saleId: number
  readonly quantity: string
  readonly pricePerShare: string
  readonly currency: string
  readonly soldAt: Date
  readonly fee: string | null
  readonly feeCurrency: string | null
}

export interface MatchedPart {
  readonly lotId: number
  readonly quantity: string
  readonly lotPricePerShare: string
  readonly lotCurrency: string
  readonly acquiredAt: Date
  readonly timeTestMet: boolean
  // The whole lot, so the caller can spread the lot fee over the matched part only.
  readonly lotQuantity: string
  readonly lotFee: string | null
  readonly lotFeeCurrency: string | null
}

export interface SaleMatch {
  readonly saleId: number
  readonly instrumentKey: string
  readonly soldAt: Date
  readonly currency: string
  readonly salePricePerShare: string
  readonly quantity: string
  readonly fee: string | null
  readonly feeCurrency: string | null
  readonly parts: readonly MatchedPart[]
  readonly unmatchedQuantity: string
}

export interface OpenLot {
  readonly lotId: number
  readonly remainingQuantity: string
  readonly pricePerShare: string
  readonly currency: string
  readonly acquiredAt: Date
  // First day on which a sale is exempt: the day AFTER the third anniversary of acquisition.
  readonly exemptFrom: Date
}

// s. 4(1)(x): exempt once the holding period EXCEEDS three years, so a sale on the anniversary
// itself does not qualify. Counted in calendar days in the Prague time zone.
function timeTestMet(acquiredAt: Date, soldAt: Date): boolean {
  return pragueDay(soldAt) > addYearsToDay(pragueDay(acquiredAt), 3)
}

function firstExemptDay(acquiredAt: Date): Date {
  return new Date(`${nextDay(addYearsToDay(pragueDay(acquiredAt), 3))}T00:00:00Z`)
}

// Ties are broken by id: two lots sharing a timestamp must match in a stable order, otherwise the
// tax result depends on whatever order Postgres happened to return.
function byAcquisition(a: TaxLot, b: TaxLot): number {
  return a.acquiredAt.getTime() - b.acquiredAt.getTime() || a.lotId - b.lotId
}

function bySale(a: TaxSale, b: TaxSale): number {
  return a.soldAt.getTime() - b.soldAt.getTime() || a.saleId - b.saleId
}

// FIFO matching of sales against purchase lots of ONE instrument: lots and sales are processed
// chronologically and a sale consumes the oldest remaining lots first.
export function fifoMatch(
  lots: readonly TaxLot[],
  sales: readonly TaxSale[],
  instrumentKey = '',
): { matches: SaleMatch[]; openLots: OpenLot[] } {
  const queue = [...lots].sort(byAcquisition).map((lot) => ({ lot, remaining: new Decimal(lot.quantity) }))
  const orderedSales = [...sales].sort(bySale)

  const matches: SaleMatch[] = []
  for (const sale of orderedSales) {
    let toMatch = new Decimal(sale.quantity)
    const parts: MatchedPart[] = []
    for (const entry of queue) {
      if (toMatch.lte(0)) break
      if (entry.remaining.lte(0)) continue
      const take = Decimal.min(entry.remaining, toMatch)
      entry.remaining = entry.remaining.minus(take)
      toMatch = toMatch.minus(take)
      parts.push({
        lotId: entry.lot.lotId,
        quantity: take.toString(),
        lotPricePerShare: entry.lot.pricePerShare,
        lotCurrency: entry.lot.currency,
        acquiredAt: entry.lot.acquiredAt,
        timeTestMet: timeTestMet(entry.lot.acquiredAt, sale.soldAt),
        lotQuantity: entry.lot.quantity,
        lotFee: entry.lot.fee,
        lotFeeCurrency: entry.lot.feeCurrency,
      })
    }
    matches.push({
      saleId: sale.saleId,
      instrumentKey,
      soldAt: sale.soldAt,
      currency: sale.currency,
      salePricePerShare: sale.pricePerShare,
      quantity: sale.quantity,
      fee: sale.fee,
      feeCurrency: sale.feeCurrency,
      parts,
      unmatchedQuantity: toMatch.toString(),
    })
  }

  const openLots: OpenLot[] = queue
    .filter((entry) => entry.remaining.gt(0))
    .map((entry) => ({
      lotId: entry.lot.lotId,
      remainingQuantity: entry.remaining.toString(),
      pricePerShare: entry.lot.pricePerShare,
      currency: entry.lot.currency,
      acquiredAt: entry.lot.acquiredAt,
      exemptFrom: firstExemptDay(entry.lot.acquiredAt),
    }))

  return { matches, openLots }
}
