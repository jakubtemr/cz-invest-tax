import { asc, eq, inArray } from 'drizzle-orm'
import { pragueYear } from '../../shared/dates.js'
import type { Db } from '../db/client.js'
import { cashTransactions, dividends, instruments, lots, positions, sales } from '../db/schema.js'
import type { CnbFxClient } from '../fx/cnb-client.js'
import { computeTax, type TaxComputation } from './computation.js'
import { SUPPORTED_TAX_YEARS } from './constants.js'
import type { SaleMatch } from './fifo.js'
import { loadRates, RateRequests } from './fx-lookup.js'
import {
  collectYears,
  filterPriced,
  matchAll,
  type OpenLotRow,
  reconcile,
  toTaxDividend,
  totalLookup,
} from './overview.js'
import type { TaxDividend, TaxInterest, YearTaxSummary } from './types.js'
import type { TaxWarning } from './warnings.js'
import { summarizeYear } from './year-summary.js'

type InstrumentRow = typeof instruments.$inferSelect

const INTEREST_TYPES = ['INTEREST_ON_FREE_CASH', 'LENDING_INTEREST']

export type { OpenLotRow } from './overview.js'

export interface TaxOverview {
  readonly summary: YearTaxSummary
  readonly computation: TaxComputation
  readonly openLots: readonly OpenLotRow[]
  readonly warnings: readonly TaxWarning[]
  readonly availableYears: readonly number[]
  readonly supportedYears: readonly number[]
}

export interface TaxOverviewInput {
  readonly year: number
  // Partial tax bases from outside the app; the progressive threshold is shared across all of them.
  readonly otherBasesCzk?: string
}

export class TaxService {
  constructor(
    private readonly db: Db,
    private readonly fx: CnbFxClient,
  ) {}

  async overview(input: TaxOverviewInput): Promise<TaxOverview> {
    const data = await this.load()
    const instrumentById = new Map(data.instrumentRows.map((row) => [row.id, row]))
    // The foreign key guarantees every lot, sale and dividend has an instrument.
    const instrument = (id: number): InstrumentRow => instrumentById.get(id)!

    const { matches, openLots } = matchAll(data.lotRows, data.saleRows, instrument)
    const taxDividends = data.dividendRows.map((row) => toTaxDividend(row, instrument(row.instrumentId)))
    const taxInterest: TaxInterest[] = data.interestRows.map((row) => ({
      amount: row.amount,
      currency: row.currency,
      occurredAt: row.occurredAt,
    }))

    const { rate, warnings: fxWarnings } = await this.loadRates(input.year, matches, taxDividends, taxInterest)
    const priced = filterPriced(input.year, matches, taxDividends, taxInterest, rate)
    const summary = summarizeYear(input.year, priced.matches, priced.dividends, priced.interest, totalLookup(rate))

    const warnings: TaxWarning[] = [...fxWarnings, ...priced.warnings, ...summary.warnings]
    const computation = computeTax(summary, input.otherBasesCzk ?? '0', warnings)

    return {
      summary,
      computation,
      openLots: reconcile(openLots, data.positionRows, warnings),
      warnings,
      availableYears: collectYears(data.saleRows, data.dividendRows, data.interestRows),
      supportedYears: SUPPORTED_TAX_YEARS,
    }
  }

  private async load() {
    const [lotRows, saleRows, dividendRows, interestRows, instrumentRows, positionRows] = await Promise.all([
      // Ordered so two rows sharing a timestamp always match in the same order: an UPDATE on lots
      // would otherwise silently reshuffle which lot a sale consumes.
      this.db.select().from(lots).orderBy(asc(lots.acquiredAt), asc(lots.id)),
      this.db.select().from(sales).orderBy(asc(sales.soldAt), asc(sales.id)),
      this.db.select().from(dividends).orderBy(asc(dividends.paidOn), asc(dividends.id)),
      this.db.select().from(cashTransactions).where(inArray(cashTransactions.type, INTEREST_TYPES)),
      this.db.select().from(instruments),
      this.db.select().from(positions).where(eq(positions.source, 'sync')),
    ])
    return { lotRows, saleRows, dividendRows, interestRows, instrumentRows, positionRows }
  }

  private async loadRates(
    year: number,
    matches: readonly SaleMatch[],
    taxDividends: readonly TaxDividend[],
    taxInterest: readonly TaxInterest[],
  ) {
    const requests = new RateRequests()
    for (const match of matches.filter((match) => pragueYear(match.soldAt) === year)) {
      requests.add(match.soldAt, match.currency)
      if (match.feeCurrency) requests.add(match.soldAt, match.feeCurrency)
      for (const part of match.parts) {
        requests.add(part.acquiredAt, part.lotCurrency)
        if (part.lotFeeCurrency) requests.add(part.acquiredAt, part.lotFeeCurrency)
      }
    }
    for (const dividend of taxDividends.filter((row) => pragueYear(row.paidOn) === year)) {
      requests.add(dividend.paidOn, dividend.netCurrency)
      if (dividend.grossAmountPerShare !== null) requests.add(dividend.paidOn, dividend.grossCurrency)
    }
    for (const item of taxInterest.filter((row) => pragueYear(row.occurredAt) === year)) {
      requests.add(item.occurredAt, item.currency)
    }
    return loadRates(this.fx, requests)
  }
}
