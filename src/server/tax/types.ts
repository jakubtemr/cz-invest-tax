import type Decimal from 'decimal.js'
import type { TaxWarning } from './warnings.js'

// Czech crowns per one unit of the currency on that day. Callers must have made sure the rate
// exists (see fx-lookup.ts); the pure math is synchronous and cannot fetch anything.
export type FxLookup = (date: Date, currency: string) => Decimal

export interface TaxDividend {
  readonly instrumentId: number
  readonly instrumentKey: string
  readonly reference: string
  readonly netAmount: string
  readonly netCurrency: string
  readonly grossAmountPerShare: string | null
  readonly quantity: string | null
  readonly grossCurrency: string
  readonly paidOn: Date
  readonly type: string
  // ISO 3166-1 alpha-2 source state, or UNKNOWN_COUNTRY.
  readonly country: string
}

export interface TaxInterest {
  readonly amount: string
  readonly currency: string
  readonly occurredAt: Date
}

export interface SaleRow {
  readonly saleId: number
  // 0 = the part of the sale with no matching purchase (a split or an incomplete history).
  readonly lotId: number
  readonly instrumentKey: string
  readonly soldAt: Date
  readonly quantity: string
  readonly proceedsCzk: string
  readonly costCzk: string
  readonly feeCzk: string
  readonly gainCzk: string
  readonly timeTestMet: boolean
  readonly taxable: boolean
}

export interface DividendRow {
  readonly instrumentId: number
  readonly instrumentKey: string
  readonly reference: string
  readonly paidOn: Date
  readonly country: string
  readonly grossCzk: string
  readonly netCzk: string
  readonly withheldCzk: string
  readonly effectiveRate: string
  readonly treatyRate: string | null
  // Materially above the treaty rate, judged once here so the screen does not re-decide it and
  // paint FX jitter red while the warning stays silent.
  readonly overTreaty: boolean
  readonly creditableCzk: string
  readonly type: string
}

// Foreign dividend income per source state - the input of the ordinary credit. See docs/TAX.md.
export interface CountryDividends {
  readonly country: string
  readonly grossCzk: string
  readonly withheldCzk: string
  readonly creditableCzk: string
}

export interface DividendTotals {
  readonly grossCzk: string
  readonly netCzk: string
  readonly withheldCzk: string
  // Czech-source dividends are taxed by final withholding (s. 36) and stay out of the s. 8 base.
  readonly domesticGrossCzk: string
  readonly domesticWithheldCzk: string
  readonly foreignGrossCzk: string
  readonly creditableCzk: string
  readonly byCountry: readonly CountryDividends[]
  readonly items: readonly DividendRow[]
}

export interface YearTaxSummary {
  readonly year: number
  // Every sale, exempt or not - the informational figure.
  readonly totalSaleProceedsCzk: string
  // What counts towards the s. 4(1)(w) limit: sales not already exempt under the time test.
  readonly limitProceedsCzk: string
  readonly under100kExemption: boolean
  // The statutory limit itself, so the screen quotes the year's number instead of inventing one.
  readonly saleExemptionLimitCzk: string
  readonly timeTestExemptProceedsCzk: string
  readonly exemptProceedsOverCapCzk: string
  readonly taxable: {
    readonly proceedsCzk: string
    readonly costCzk: string
    // May be negative - informational.
    readonly gainCzk: string
    // s. 10(4): a loss on the partial base is disregarded, so this is never negative.
    readonly baseCzk: string
  }
  readonly sales: readonly SaleRow[]
  readonly dividends: DividendTotals
  readonly interestCzk: string
  readonly warnings: readonly TaxWarning[]
}
