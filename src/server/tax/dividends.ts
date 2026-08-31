import Decimal from 'decimal.js'
import { pragueDay, pragueYear } from '../../shared/dates.js'
import type { TaxYearConstants } from './constants.js'
import type { DividendRow, DividendTotals, FxLookup, TaxDividend } from './types.js'
import { type TaxWarning, warn } from './warnings.js'

const CZECH_COUNTRY = 'CZ'

// Withholding is never reported by the broker. It is inferred from the gross - reconstructed as
// price per share x quantity at the CNB rate - minus the net, which the broker credited in the
// account currency at ITS rate on ITS day and rounded to whole hellers. Two FX bases and a
// rounding, so the implied rate jitters around the real one, the more so the smaller the payment.
const WITHHOLDING_TOLERANCE_CZK = 1
const WITHHOLDING_TOLERANCE_RATIO = 0.01

// The excess over a treaty rate is therefore judged in PERCENTAGE POINTS, never as an amount: on a
// portfolio of fractional shares every withholding is under a crown, so an amount-based tolerance
// would hide a 25 % Canadian rate exactly as readily as a rounding error. The floor covers FX
// drift; below it the tolerance widens by what one heller of rounding is worth on this payment.
const RATE_TOLERANCE = 0.01
const NET_ROUNDING_CZK = 0.01

function amountTolerance(gross: Decimal): Decimal {
  return Decimal.max(WITHHOLDING_TOLERANCE_CZK, gross.times(WITHHOLDING_TOLERANCE_RATIO))
}

function rateTolerance(gross: Decimal): Decimal {
  if (gross.lte(0)) return new Decimal(1)
  return Decimal.max(RATE_TOLERANCE, new Decimal(NET_ROUNDING_CZK).div(gross))
}

interface Priced {
  readonly gross: Decimal
  readonly net: Decimal
  readonly withheld: Decimal
}

function price(dividend: TaxDividend, fx: FxLookup, warnings: TaxWarning[]): Priced {
  const net = new Decimal(dividend.netAmount).times(fx(dividend.paidOn, dividend.netCurrency))
  let gross = net
  if (dividend.grossAmountPerShare !== null && dividend.quantity !== null) {
    gross = new Decimal(dividend.grossAmountPerShare)
      .times(dividend.quantity)
      .times(fx(dividend.paidOn, dividend.grossCurrency))
  } else {
    warnings.push(warn('dividendGrossMissing', { instrument: dividend.instrumentKey, day: pragueDay(dividend.paidOn) }))
  }

  const overpaid = net.minus(gross)
  if (overpaid.gt(amountTolerance(gross))) {
    warnings.push(
      warn(
        'withholdingNegative',
        {
          instrument: dividend.instrumentKey,
          day: pragueDay(dividend.paidOn),
          amount: overpaid.toFixed(2),
        },
        'error',
      ),
    )
  }
  // Withholding never goes negative, whatever the broker reports.
  return { gross, net, withheld: Decimal.max(0, gross.minus(net)) }
}

// A rate above the treaty cap means no relief at source (a US payer withholding 30 % without a
// W-8BEN). The excess is refundable from the source state and is NOT creditable in Czechia.
function creditable(
  priced: Priced,
  dividend: TaxDividend,
  constants: TaxYearConstants,
  warnings: TaxWarning[],
): { amount: Decimal; treatyRate: number | null; effectiveRate: Decimal; overTreaty: boolean } {
  const effectiveRate = priced.gross.gt(0) ? priced.withheld.div(priced.gross) : new Decimal(0)
  const treaty = constants.treatyWithholding[dividend.country]
  if (!treaty) {
    if (priced.withheld.gt(0)) warnings.push(warn('treatyUnknown', { country: dividend.country }))
    return { amount: priced.withheld, treatyRate: null, effectiveRate, overTreaty: false }
  }

  // The cap always applies - the treaty is the treaty, and capping can only understate the credit.
  // The warning is a separate judgement: it fires only when the rate is materially above the treaty,
  // so a genuine 25 % is reported and an FX wobble around 15 % is not.
  const cap = priced.gross.times(treaty.rate)
  const overTreaty = effectiveRate.minus(treaty.rate).gt(rateTolerance(priced.gross))
  if (overTreaty) {
    warnings.push(
      warn('treatyExceeded', {
        instrument: dividend.instrumentKey,
        country: dividend.country,
        effective: effectiveRate.times(100).toFixed(2),
        treaty: new Decimal(treaty.rate).times(100).toFixed(2),
        excess: priced.withheld.minus(cap).toFixed(2),
      }),
    )
  }
  return { amount: Decimal.min(priced.withheld, cap), treatyRate: treaty.rate, effectiveRate, overTreaty }
}

interface Bucket {
  gross: Decimal
  net: Decimal
  withheld: Decimal
  creditable: Decimal
}

function bucketOf(buckets: Map<string, Bucket>, country: string): Bucket {
  const existing = buckets.get(country)
  if (existing) return existing
  const fresh = { gross: new Decimal(0), net: new Decimal(0), withheld: new Decimal(0), creditable: new Decimal(0) }
  buckets.set(country, fresh)
  return fresh
}

export function sumDividends(
  year: number,
  dividends: readonly TaxDividend[],
  fx: FxLookup,
  constants: TaxYearConstants,
  warnings: TaxWarning[],
): DividendTotals {
  const items: DividendRow[] = []
  const buckets = new Map<string, Bucket>()
  const domesticSeen = new Set<string>()

  for (const dividend of dividends.filter((row) => pragueYear(row.paidOn) === year)) {
    const priced = price(dividend, fx, warnings)
    const domestic = dividend.country === CZECH_COUNTRY
    const credit = domestic
      ? { amount: new Decimal(0), treatyRate: null, effectiveRate: new Decimal(0), overTreaty: false }
      : creditable(priced, dividend, constants, warnings)
    if (domestic && !domesticSeen.has(dividend.instrumentKey)) {
      domesticSeen.add(dividend.instrumentKey)
      warnings.push(warn('domesticDividend', { instrument: dividend.instrumentKey }, 'info'))
    }

    const bucket = bucketOf(buckets, dividend.country)
    bucket.gross = bucket.gross.plus(priced.gross)
    bucket.net = bucket.net.plus(priced.net)
    bucket.withheld = bucket.withheld.plus(priced.withheld)
    bucket.creditable = bucket.creditable.plus(credit.amount)

    items.push({
      instrumentId: dividend.instrumentId,
      instrumentKey: dividend.instrumentKey,
      reference: dividend.reference,
      paidOn: dividend.paidOn,
      country: dividend.country,
      grossCzk: priced.gross.toFixed(2),
      netCzk: priced.net.toFixed(2),
      withheldCzk: priced.withheld.toFixed(2),
      effectiveRate: credit.effectiveRate.times(100).toFixed(2),
      treatyRate: credit.treatyRate === null ? null : new Decimal(credit.treatyRate).times(100).toFixed(2),
      overTreaty: credit.overTreaty,
      creditableCzk: credit.amount.toFixed(2),
      type: dividend.type,
    })
  }

  return totals(buckets, items)
}

function totals(buckets: ReadonlyMap<string, Bucket>, items: DividendRow[]): DividendTotals {
  const all = [...buckets]
  const foreign = all.filter(([country]) => country !== CZECH_COUNTRY)
  const domestic = all.filter(([country]) => country === CZECH_COUNTRY)
  const sum = (rows: readonly (readonly [string, Bucket])[], pick: (bucket: Bucket) => Decimal): Decimal =>
    rows.reduce((acc, [, bucket]) => acc.plus(pick(bucket)), new Decimal(0))

  return {
    grossCzk: sum(all, (b) => b.gross).toFixed(2),
    netCzk: sum(all, (b) => b.net).toFixed(2),
    withheldCzk: sum(all, (b) => b.withheld).toFixed(2),
    domesticGrossCzk: sum(domestic, (b) => b.gross).toFixed(2),
    domesticWithheldCzk: sum(domestic, (b) => b.withheld).toFixed(2),
    foreignGrossCzk: sum(foreign, (b) => b.gross).toFixed(2),
    creditableCzk: sum(foreign, (b) => b.creditable).toFixed(2),
    byCountry: foreign
      .map(([country, bucket]) => ({
        country,
        grossCzk: bucket.gross.toFixed(2),
        withheldCzk: bucket.withheld.toFixed(2),
        creditableCzk: bucket.creditable.toFixed(2),
      }))
      .sort((a, b) => a.country.localeCompare(b.country)),
    items,
  }
}
