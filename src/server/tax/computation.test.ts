import { describe, expect, it } from 'vitest'
import { computeTax } from './computation.js'
import { taxConstants } from './constants.js'
import type { CountryDividends, YearTaxSummary } from './types.js'
import type { TaxWarning } from './warnings.js'

const THRESHOLD_2026 = taxConstants(2026).topRateThresholdCzk

function summary(overrides: {
  gainCzk?: string
  foreignGrossCzk?: string
  interestCzk?: string
  byCountry?: CountryDividends[]
}): YearTaxSummary {
  return {
    year: 2026,
    totalSaleProceedsCzk: '0.00',
    limitProceedsCzk: '0.00',
    under100kExemption: false,
    saleExemptionLimitCzk: '100000',
    timeTestExemptProceedsCzk: '0.00',
    exemptProceedsOverCapCzk: '0.00',
    taxable: {
      proceedsCzk: '0.00',
      costCzk: '0.00',
      gainCzk: overrides.gainCzk ?? '0.00',
      baseCzk: overrides.gainCzk ?? '0.00',
    },
    sales: [],
    dividends: {
      grossCzk: overrides.foreignGrossCzk ?? '0.00',
      netCzk: '0.00',
      withheldCzk: '0.00',
      domesticGrossCzk: '0.00',
      domesticWithheldCzk: '0.00',
      foreignGrossCzk: overrides.foreignGrossCzk ?? '0.00',
      creditableCzk: '0.00',
      byCountry: overrides.byCountry ?? [],
      items: [],
    },
    interestCzk: overrides.interestCzk ?? '0.00',
    warnings: [],
  }
}

const run = (
  input: Parameters<typeof summary>[0],
  otherBases = '0',
): { result: ReturnType<typeof computeTax>; warnings: TaxWarning[] } => {
  const warnings: TaxWarning[] = []
  return { result: computeTax(summary(input), otherBases, warnings), warnings }
}

describe('computeTax - the base', () => {
  it('s. 8 is gross foreign dividends plus interest, s. 10 is the clamped sale gain', () => {
    const { result } = run({ foreignGrossCzk: '10000.00', interestCzk: '500.00', gainCzk: '20000.00' })
    expect(result.section8BaseCzk).toBe('10500.00')
    expect(result.section10BaseCzk).toBe('20000.00')
    expect(result.totalBaseCzk).toBe('30500.00')
  })

  it('rounds the total base down to whole hundreds (s. 16)', () => {
    const { result } = run({ gainCzk: '30599.99' })
    expect(result.roundedBaseCzk).toBe('30500.00')
    // 30 500 x 15 %
    expect(result.taxBeforeCreditCzk).toBe('4575.00')
  })

  it('a negative other-bases input is treated as zero rather than a deduction', () => {
    const { result } = run({ gainCzk: '10000.00' }, '-50000')
    expect(result.otherBasesCzk).toBe('0.00')
    expect(result.totalBaseCzk).toBe('10000.00')
  })

  it('other partial bases push income over the threshold, which is shared across sections', () => {
    const justUnder = run({ gainCzk: '100000.00' })
    expect(justUnder.result.topRateTaxCzk).toBe('0.00')

    const pushedOver = run({ gainCzk: '100000.00' }, String(THRESHOLD_2026))
    const overThreshold = Number(pushedOver.result.roundedBaseCzk) - THRESHOLD_2026
    expect(Number(pushedOver.result.topRateTaxCzk)).toBeCloseTo(overThreshold * 0.23, 2)
    expect(pushedOver.warnings.map((w) => w.code)).toContain('otherBasesUsed')
  })

  it('splits at the threshold: the base rate below it, the top rate above', () => {
    const { result } = run({ gainCzk: String(THRESHOLD_2026 + 200) })
    // the threshold is not a round hundred, so s. 16 rounding decides how much lands in each band
    expect(Number(result.roundedBaseCzk)).toBe(Math.floor((THRESHOLD_2026 + 200) / 100) * 100)
    expect(Number(result.baseRateTaxCzk)).toBeCloseTo(THRESHOLD_2026 * 0.15, 2)
    expect(Number(result.topRateTaxCzk)).toBeCloseTo((Number(result.roundedBaseCzk) - THRESHOLD_2026) * 0.23, 2)
  })

  it('rounds the tax up to whole crowns', () => {
    // 150 x 15 % = 22.5
    const { result } = run({ gainCzk: '150.00' })
    expect(result.roundedBaseCzk).toBe('100.00')
    expect(result.taxBeforeCreditCzk).toBe('15.00')
  })

  it('a zero base yields zero tax and no credit', () => {
    const { result } = run({
      byCountry: [{ country: 'US', grossCzk: '0.00', withheldCzk: '0.00', creditableCzk: '0.00' }],
    })
    expect(result.taxBeforeCreditCzk).toBe('0.00')
    expect(result.creditCzk).toBe('0.00')
    expect(result.creditsByCountry[0]!.maxCreditCzk).toBe('0.00')
  })
})

describe('computeTax - the ordinary credit', () => {
  it('credits foreign tax in full when the proportional Czech tax is larger', () => {
    // base 100 000, tax 15 000; US income 50 000 so the cap is 7 500, well above the 3 000 withheld
    const { result } = run({
      gainCzk: '50000.00',
      foreignGrossCzk: '50000.00',
      byCountry: [{ country: 'US', grossCzk: '50000.00', withheldCzk: '3000.00', creditableCzk: '3000.00' }],
    })
    expect(result.roundedBaseCzk).toBe('100000.00')
    expect(result.taxBeforeCreditCzk).toBe('15000.00')
    expect(result.creditsByCountry[0]!.maxCreditCzk).toBe('7500.00')
    expect(result.creditCzk).toBe('3000.00')
    expect(result.taxAfterCreditCzk).toBe('12000.00')
    expect(result.nonCreditableResidualCzk).toBe('0.00')
  })

  it('caps the credit at the Czech tax attributable to that state and reports the residual', () => {
    // base 100 000, tax 15 000; US income 50 000 caps the credit at 7 500 of the 9 000 withheld
    const { result, warnings } = run({
      gainCzk: '50000.00',
      foreignGrossCzk: '50000.00',
      byCountry: [{ country: 'US', grossCzk: '50000.00', withheldCzk: '9000.00', creditableCzk: '9000.00' }],
    })
    expect(result.creditCzk).toBe('7500.00')
    expect(result.taxAfterCreditCzk).toBe('7500.00')
    expect(result.nonCreditableResidualCzk).toBe('1500.00')
    expect(warnings.map((w) => w.code)).toContain('creditResidual')
  })

  it('computes the cap per state, so a generous treaty elsewhere cannot subsidise it', () => {
    const { result } = run({
      gainCzk: '0.00',
      foreignGrossCzk: '100000.00',
      byCountry: [
        { country: 'DE', grossCzk: '50000.00', withheldCzk: '0.00', creditableCzk: '0.00' },
        { country: 'US', grossCzk: '50000.00', withheldCzk: '9000.00', creditableCzk: '9000.00' },
      ],
    })
    // the unused German headroom does not raise the American cap
    expect(result.creditsByCountry.find((c) => c.country === 'US')!.creditCzk).toBe('7500.00')
    expect(result.creditCzk).toBe('7500.00')
  })

  it('says nothing about a residual when there was no Czech tax to credit against', () => {
    // base rounds to zero, so nothing could be credited - the zero already tells that story
    const { result, warnings } = run({
      foreignGrossCzk: '57.30',
      byCountry: [{ country: 'US', grossCzk: '57.30', withheldCzk: '8.38', creditableCzk: '8.38' }],
    })
    expect(result.roundedBaseCzk).toBe('0.00')
    expect(result.nonCreditableResidualCzk).toBe('8.38')
    expect(warnings.map((w) => w.code)).not.toContain('creditResidual')
  })

  it('an unused credit is not a refund - tax owed stops at zero', () => {
    const { result } = run({
      foreignGrossCzk: '1000.00',
      byCountry: [{ country: 'US', grossCzk: '1000.00', withheldCzk: '900.00', creditableCzk: '900.00' }],
    })
    expect(result.taxAfterCreditCzk).toBe('0.00')
  })

  it('rejects a year it has no constants for', () => {
    const warnings: TaxWarning[] = []
    expect(() => computeTax({ ...summary({}), year: 1999 }, '0', warnings)).toThrow(
      expect.objectContaining({ code: 'TAX_YEAR_UNSUPPORTED' }),
    )
  })
})
