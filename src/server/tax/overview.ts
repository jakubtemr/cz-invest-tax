import Decimal from 'decimal.js'
import { pragueDay, pragueYear } from '../../shared/dates.js'
import type { dividends, instruments, lots, positions, sales } from '../db/schema.js'
import { UNKNOWN_INSTRUMENT_CURRENCY } from '../sync/sync-service.js'
import { countryFromIsin } from './country.js'
import { fifoMatch, type OpenLot, type SaleMatch } from './fifo.js'
import type { RateLookup } from './fx-lookup.js'
import { reconcileOpenLots, reconcileWarning } from './reconcile.js'
import { toTaxLot, toTaxSale } from './rows.js'
import type { FxLookup, TaxDividend, TaxInterest } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

// The pure half of the tax overview: everything between "rows came out of the database" and
// "here is a year". Kept apart from TaxService so it can be reasoned about - and tested - without
// a database anywhere near it.

type LotRow = typeof lots.$inferSelect
type SaleTableRow = typeof sales.$inferSelect
type InstrumentRow = typeof instruments.$inferSelect
type PositionRow = typeof positions.$inferSelect
type DividendTableRow = typeof dividends.$inferSelect

export interface OpenLotRow extends OpenLot {
  readonly accountId: number
  readonly instrumentId: number
  readonly instrumentKey: string
  readonly instrumentName: string | null
  readonly reference: string
  readonly alreadyExempt: boolean
  readonly source: string
}

export function toTaxDividend(row: DividendTableRow, instrument: InstrumentRow): TaxDividend {
  // An instrument whose currency is unknown (a dividend arriving without an instrument object)
  // cannot have its gross amount converted; the summary falls back to net and warns.
  const grossComputable = instrument.currency !== UNKNOWN_INSTRUMENT_CURRENCY
  return {
    instrumentId: instrument.id,
    instrumentKey: instrument.ticker,
    reference: row.reference,
    netAmount: row.amount,
    netCurrency: row.currency,
    grossAmountPerShare: grossComputable ? row.grossAmountPerShare : null,
    quantity: grossComputable ? row.quantity : null,
    grossCurrency: instrument.currency,
    paidOn: row.paidOn,
    type: row.type,
    country: instrument.country ?? countryFromIsin(instrument.isin),
  }
}

function groupBy<T extends { instrumentId: number }>(rows: readonly T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>()
  for (const row of rows) {
    const group = groups.get(row.instrumentId)
    if (group) group.push(row)
    else groups.set(row.instrumentId, [row])
  }
  return groups
}

// FIFO runs per instrument, not per account: the tax is assessed on the taxpayer, so a purchase on
// one account and a sale on another are still the same holding.
export function matchAll(
  lotRows: readonly LotRow[],
  saleRows: readonly SaleTableRow[],
  instrument: (id: number) => InstrumentRow,
): { matches: SaleMatch[]; openLots: OpenLotRow[] } {
  const lotById = new Map(lotRows.map((row) => [row.id, row]))
  const lotsByInstrument = groupBy(lotRows)
  const salesByInstrument = groupBy(saleRows)
  const today = pragueDay(new Date())
  const matches: SaleMatch[] = []
  const openLots: OpenLotRow[] = []

  for (const instrumentId of new Set([...lotsByInstrument.keys(), ...salesByInstrument.keys()])) {
    const result = fifoMatch(
      (lotsByInstrument.get(instrumentId) ?? []).map(toTaxLot),
      (salesByInstrument.get(instrumentId) ?? []).map(toTaxSale),
      instrument(instrumentId).ticker,
    )
    matches.push(...result.matches)
    for (const open of result.openLots) {
      const original = lotById.get(open.lotId)!
      openLots.push({
        ...open,
        accountId: original.accountId,
        instrumentId,
        instrumentKey: instrument(instrumentId).ticker,
        instrumentName: instrument(instrumentId).name,
        reference: original.reference,
        // exemptFrom is the first exempt calendar day, so days get compared, not timestamps.
        alreadyExempt: today >= pragueDay(open.exemptFrom),
        source: original.source,
      })
    }
  }
  return { matches, openLots }
}

// Every leg of an item has to be priced, the lot currency and the fee currency included. Dropping
// only the sale currency would let an unpriced lot reach the math and blow up there instead.
export function filterPriced(
  year: number,
  matches: readonly SaleMatch[],
  taxDividends: readonly TaxDividend[],
  taxInterest: readonly TaxInterest[],
  rate: RateLookup,
): {
  matches: SaleMatch[]
  dividends: TaxDividend[]
  interest: TaxInterest[]
  warnings: TaxWarning[]
} {
  const warnings: TaxWarning[] = []
  const drop = (instrument: string): void => {
    warnings.push(warn('itemDroppedNoRate', { instrument }, 'error'))
  }
  const priced = (date: Date, currency: string | null): boolean => currency === null || rate(date, currency) !== null

  const keptMatches = matches.filter((match) => {
    if (pragueYear(match.soldAt) !== year) return false
    const ok =
      priced(match.soldAt, match.currency) &&
      priced(match.soldAt, match.feeCurrency) &&
      match.parts.every(
        (part) => priced(part.acquiredAt, part.lotCurrency) && priced(part.acquiredAt, part.lotFeeCurrency),
      )
    if (!ok) drop(match.instrumentKey)
    return ok
  })

  const keptDividends = taxDividends.filter((dividend) => {
    if (pragueYear(dividend.paidOn) !== year) return false
    const ok =
      priced(dividend.paidOn, dividend.netCurrency) &&
      (dividend.grossAmountPerShare === null || priced(dividend.paidOn, dividend.grossCurrency))
    if (!ok) drop(dividend.instrumentKey)
    return ok
  })

  const keptInterest = taxInterest.filter(
    (item) => pragueYear(item.occurredAt) === year && priced(item.occurredAt, item.currency),
  )

  return { matches: keptMatches, dividends: keptDividends, interest: keptInterest, warnings }
}

// After filterPriced every rate the math asks for is present, so the lookup can be total.
export function totalLookup(rate: RateLookup): FxLookup {
  return (date, currency) => rate(date, currency)!
}

// Broker quantity versus history, per account and instrument - an instrument-level aggregate would
// hide drift on one account behind a matching total on another.
export function reconcile(
  openLots: readonly OpenLotRow[],
  positionRows: readonly PositionRow[],
  warnings: TaxWarning[],
): OpenLotRow[] {
  const quantities = new Map(positionRows.map((row) => [`${row.accountId}:${row.instrumentId}`, row.quantity]))
  // Only accounts the broker actually reports can be reconciled; on a manual account a missing
  // position means nobody has told us anything, not that the holding is closed.
  const brokerAccounts = new Set(positionRows.map((row) => row.accountId))

  const groups = new Map<string, OpenLotRow[]>()
  for (const lot of openLots) {
    const key = `${lot.accountId}:${lot.instrumentId}`
    const group = groups.get(key)
    if (group) group.push(lot)
    else groups.set(key, [lot])
  }

  const result: OpenLotRow[] = []
  for (const [key, group] of groups) {
    const first = group[0]!
    const broker = brokerAccounts.has(first.accountId) ? new Decimal(quantities.get(key) ?? 0) : null
    const history = group.reduce((sum, lot) => sum.plus(lot.remainingQuantity), new Decimal(0))
    const outcome = reconcileOpenLots(group, broker)
    const warning = reconcileWarning(outcome, first.instrumentKey, broker?.toString() ?? '', history.toString())
    if (warning) warnings.push(warning)
    result.push(...outcome.lots.map((lot, index) => ({ ...group[index]!, ...lot })))
  }

  return result.sort((a, b) => a.exemptFrom.getTime() - b.exemptFrom.getTime())
}

export function collectYears(
  saleRows: readonly { soldAt: Date }[],
  dividendRows: readonly { paidOn: Date }[],
  interestRows: readonly { occurredAt: Date }[],
): number[] {
  const years = new Set<number>()
  for (const row of saleRows) years.add(pragueYear(row.soldAt))
  for (const row of dividendRows) years.add(pragueYear(row.paidOn))
  for (const row of interestRows) years.add(pragueYear(row.occurredAt))
  years.add(pragueYear(new Date()))
  return [...years].sort((a, b) => b - a)
}
