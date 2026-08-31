import Decimal from 'decimal.js'
import type { CountryDividends } from './types.js'

// The ordinary credit method (s. 38f(2)): tax withheld abroad is credited only up to the
// Czech tax attributable to the income from that state, computed state by state - a generous
// treaty rate in one country cannot subsidise tax on income from another.

export interface CountryCredit {
  readonly country: string
  readonly grossCzk: string
  readonly withheldCzk: string
  readonly creditableCzk: string
  readonly maxCreditCzk: string
  readonly creditCzk: string
  // Creditable but above the cap. s. 24(2)(ch) allows it as an expense in the following year;
  // this app does not carry anything forward.
  readonly residualCzk: string
}

export interface Credits {
  readonly byCountry: readonly CountryCredit[]
  readonly totalCreditCzk: string
  readonly totalResidualCzk: string
}

export function computeCredits(
  byCountry: readonly CountryDividends[],
  czechTaxCzk: Decimal,
  totalBaseCzk: Decimal,
): Credits {
  const credits = byCountry.map((entry) => {
    const creditable = new Decimal(entry.creditableCzk)
    // With no base there is no Czech tax to reduce, so nothing can be credited.
    const maxCredit = totalBaseCzk.gt(0)
      ? czechTaxCzk.times(new Decimal(entry.grossCzk)).div(totalBaseCzk)
      : new Decimal(0)
    const credit = Decimal.min(creditable, maxCredit)
    return {
      country: entry.country,
      grossCzk: entry.grossCzk,
      withheldCzk: entry.withheldCzk,
      creditableCzk: entry.creditableCzk,
      maxCreditCzk: maxCredit.toFixed(2),
      creditCzk: credit.toFixed(2),
      residualCzk: creditable.minus(credit).toFixed(2),
    }
  })

  const total = (pick: (credit: CountryCredit) => string): string =>
    credits.reduce((sum, credit) => sum.plus(pick(credit)), new Decimal(0)).toFixed(2)

  return {
    byCountry: credits,
    totalCreditCzk: total((credit) => credit.creditCzk),
    totalResidualCzk: total((credit) => credit.residualCzk),
  }
}
