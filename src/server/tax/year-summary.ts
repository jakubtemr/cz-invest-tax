import Decimal from 'decimal.js'
import { pragueYear } from '../../shared/dates.js'
import { taxConstants } from './constants.js'
import { sumDividends } from './dividends.js'
import type { SaleMatch } from './fifo.js'
import { sumProceeds } from './proceeds.js'
import { splitSales } from './sale-rows.js'
import type { FxLookup, TaxDividend, TaxInterest, YearTaxSummary } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

// s. 4(3), in force from 2025: income exempt under the time test is capped. Above the cap the
// excess is taxable, and which sales get taxed is the taxpayer's choice - the app only reports
// the overflow, because the cap also counts exempt income this app never sees.
function exemptOverCap(year: number, exemptByTimeTest: Decimal, warnings: TaxWarning[]): Decimal {
  const cap = taxConstants(year).exemptProceedsCapCzk
  if (cap === null) return new Decimal(0)
  const over = Decimal.max(0, exemptByTimeTest.minus(cap))
  if (over.gt(0)) {
    warnings.push(warn('exemptOverCap', { amount: over.toFixed(2), cap: String(cap) }, 'error'))
  }
  return over
}

function sumInterest(year: number, interest: readonly TaxInterest[], fx: FxLookup): Decimal {
  return interest
    .filter((item) => pragueYear(item.occurredAt) === year)
    .reduce((sum, item) => sum.plus(new Decimal(item.amount).times(fx(item.occurredAt, item.currency))), new Decimal(0))
}

export function summarizeYear(
  year: number,
  matches: readonly SaleMatch[],
  dividends: readonly TaxDividend[],
  interest: readonly TaxInterest[],
  fx: FxLookup,
): YearTaxSummary {
  const constants = taxConstants(year)
  const warnings: TaxWarning[] = []
  const yearMatches = matches.filter((match) => pragueYear(match.soldAt) === year)

  const proceeds = sumProceeds(yearMatches, fx, warnings)
  const under100k = proceeds.limit.lte(constants.saleExemptionLimitCzk)
  const breakdown = splitSales(yearMatches, fx, under100k, warnings)
  const gain = breakdown.taxableProceeds.minus(breakdown.taxableCost)

  return {
    year,
    totalSaleProceedsCzk: proceeds.all.toFixed(2),
    limitProceedsCzk: proceeds.limit.toFixed(2),
    under100kExemption: under100k,
    saleExemptionLimitCzk: String(constants.saleExemptionLimitCzk),
    timeTestExemptProceedsCzk: breakdown.exemptByTimeTest.toFixed(2),
    exemptProceedsOverCapCzk: exemptOverCap(year, breakdown.exemptByTimeTest, warnings).toFixed(2),
    taxable: {
      proceedsCzk: breakdown.taxableProceeds.toFixed(2),
      costCzk: breakdown.taxableCost.toFixed(2),
      gainCzk: gain.toFixed(2),
      // s. 10(4): the excess of expenses over income in the partial base is disregarded.
      baseCzk: Decimal.max(0, gain).toFixed(2),
    },
    sales: breakdown.sales,
    dividends: sumDividends(year, dividends, fx, constants, warnings),
    interestCzk: sumInterest(year, interest, fx).toFixed(2),
    warnings,
  }
}
