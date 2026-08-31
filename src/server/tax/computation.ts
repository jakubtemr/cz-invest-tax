import Decimal from 'decimal.js'
import { taxConstants } from './constants.js'
import { type CountryCredit, computeCredits } from './credit.js'
import type { YearTaxSummary } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

// s. 16: the tax base is rounded down to whole hundreds of crowns.
const BASE_ROUNDING_CZK = 100

export interface TaxComputation {
  // Partial bases from other sections (employment, business, rent) that the app cannot see. The
  // progressive threshold is shared across all of them, so the top rate cannot be decided without
  // this number; it defaults to zero, which is exact for someone whose only income is investments.
  readonly otherBasesCzk: string
  // s. 8: capital income - gross dividends from abroad plus interest on cash.
  readonly section8BaseCzk: string
  // s. 10: other income - the sale gain after the s. 10(4) clamp.
  readonly section10BaseCzk: string
  readonly totalBaseCzk: string
  readonly roundedBaseCzk: string
  readonly baseRateTaxCzk: string
  readonly topRateTaxCzk: string
  readonly taxBeforeCreditCzk: string
  readonly creditCzk: string
  readonly taxAfterCreditCzk: string
  readonly nonCreditableResidualCzk: string
  readonly topRateThresholdCzk: string
  readonly creditsByCountry: readonly CountryCredit[]
}

function floorToHundreds(value: Decimal): Decimal {
  return value.div(BASE_ROUNDING_CZK).floor().times(BASE_ROUNDING_CZK)
}

export function computeTax(summary: YearTaxSummary, otherBasesCzk: string, warnings: TaxWarning[]): TaxComputation {
  const constants = taxConstants(summary.year)
  const other = Decimal.max(0, new Decimal(otherBasesCzk))
  const section8 = new Decimal(summary.dividends.foreignGrossCzk).plus(summary.interestCzk)
  const section10 = new Decimal(summary.taxable.baseCzk)

  const totalBase = section8.plus(section10).plus(other)
  // s. 16 rounds the whole base, not each partial base: rounding them separately would shave a
  // hundred crowns off each and understate the tax. See docs/TAX.md.
  const rounded = floorToHundreds(totalBase)
  const threshold = new Decimal(constants.topRateThresholdCzk)
  const baseRateTax = Decimal.min(rounded, threshold).times(constants.baseRate)
  const topRateTax = Decimal.max(0, rounded.minus(threshold)).times(constants.topRate)
  const taxBeforeCredit = baseRateTax.plus(topRateTax).ceil()

  const credits = computeCredits(summary.dividends.byCountry, taxBeforeCredit, rounded)
  const residual = new Decimal(credits.totalResidualCzk)
  // With no Czech tax there is nothing to credit against, and the zero already says so; the note
  // about carrying the residual forward only helps when tax was actually due.
  if (residual.gt(0) && taxBeforeCredit.gt(0)) {
    warnings.push(warn('creditResidual', { amount: residual.toFixed(2) }))
  }
  if (other.gt(0)) warnings.push(warn('otherBasesUsed', { amount: other.toFixed(2) }, 'info'))

  return {
    otherBasesCzk: other.toFixed(2),
    section8BaseCzk: section8.toFixed(2),
    section10BaseCzk: section10.toFixed(2),
    totalBaseCzk: totalBase.toFixed(2),
    roundedBaseCzk: rounded.toFixed(2),
    baseRateTaxCzk: baseRateTax.toFixed(2),
    topRateTaxCzk: topRateTax.toFixed(2),
    taxBeforeCreditCzk: taxBeforeCredit.toFixed(2),
    creditCzk: credits.totalCreditCzk,
    // Tax owed is never negative: an unused credit is not a refund.
    taxAfterCreditCzk: Decimal.max(0, taxBeforeCredit.minus(credits.totalCreditCzk)).toFixed(2),
    nonCreditableResidualCzk: credits.totalResidualCzk,
    topRateThresholdCzk: threshold.toFixed(2),
    creditsByCountry: credits.byCountry,
  }
}
