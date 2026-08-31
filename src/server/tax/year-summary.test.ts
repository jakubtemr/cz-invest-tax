import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import type { MatchedPart, SaleMatch } from './fifo.js'
import type { TaxDividend, TaxInterest } from './types.js'
import { summarizeYear } from './year-summary.js'

// fx stub: USD = 24, EUR = 25, CZK = 1, regardless of date
const fx = (_date: Date, currency: string): Decimal => {
  const rates: Record<string, number> = { USD: 24, EUR: 25, CZK: 1 }
  const rate = rates[currency]
  if (!rate) throw new Error(`no fx for ${currency}`)
  return new Decimal(rate)
}

function part(overrides: Partial<MatchedPart> = {}): MatchedPart {
  return {
    lotId: 1,
    quantity: '10',
    lotPricePerShare: '100',
    lotCurrency: 'USD',
    acquiredAt: new Date('2025-01-10T00:00:00Z'),
    timeTestMet: false,
    lotQuantity: '10',
    lotFee: null,
    lotFeeCurrency: null,
    ...overrides,
  }
}

function match(overrides: Partial<SaleMatch> & { saleId: number }): SaleMatch {
  const parts = overrides.parts ?? [part()]
  return {
    instrumentKey: 'AAPL_US_EQ',
    soldAt: new Date('2026-03-01T10:00:00Z'),
    currency: 'USD',
    salePricePerShare: '150',
    quantity: parts
      .reduce((sum, p) => sum.plus(p.quantity), new Decimal(overrides.unmatchedQuantity ?? '0'))
      .toString(),
    fee: null,
    feeCurrency: null,
    unmatchedQuantity: '0',
    ...overrides,
    parts,
  }
}

const noDividends: TaxDividend[] = []
const noInterest: TaxInterest[] = []
const codes = (summary: { warnings: readonly { code: string }[] }): string[] => summary.warnings.map((w) => w.code)

describe('summarizeYear - sales', () => {
  it('under 100k CZK of limit proceeds everything is exempt', () => {
    // 10 x 150 USD x 24 = 36 000 CZK < 100 000
    const summary = summarizeYear(2026, [match({ saleId: 1 })], noDividends, noInterest, fx)

    expect(summary.totalSaleProceedsCzk).toBe('36000.00')
    expect(summary.limitProceedsCzk).toBe('36000.00')
    expect(summary.under100kExemption).toBe(true)
    expect(summary.taxable.gainCzk).toBe('0.00')
    expect(summary.sales[0]!.taxable).toBe(false)
  })

  it('sales already exempt under the time test do not consume the 100k limit', () => {
    const failing = match({ saleId: 1 }) // proceeds 36 000, cost 24 000
    const passing = match({
      saleId: 2,
      salePricePerShare: '400',
      parts: [part({ lotId: 2, acquiredAt: new Date('2020-01-01T00:00:00Z'), timeTestMet: true })],
    }) // proceeds 96 000, exempt under the time test
    const summary = summarizeYear(2026, [failing, passing], noDividends, noInterest, fx)

    // the informational total is still everything sold...
    expect(summary.totalSaleProceedsCzk).toBe('132000.00')
    // ...but the limit only measures what is not already exempt
    expect(summary.limitProceedsCzk).toBe('36000.00')
    expect(summary.under100kExemption).toBe(true)
    expect(summary.taxable.gainCzk).toBe('0.00')
    expect(summary.timeTestExemptProceedsCzk).toBe('96000.00')
  })

  it('over the limit, parts failing the time test are taxable and passing parts stay exempt', () => {
    const big = match({ saleId: 1, salePricePerShare: '500' }) // proceeds 120 000, cost 24 000
    const passing = match({
      saleId: 2,
      salePricePerShare: '400',
      parts: [part({ lotId: 2, acquiredAt: new Date('2020-01-01T00:00:00Z'), timeTestMet: true })],
    })
    const summary = summarizeYear(2026, [big, passing], noDividends, noInterest, fx)

    expect(summary.limitProceedsCzk).toBe('120000.00')
    expect(summary.under100kExemption).toBe(false)
    expect(summary.taxable.proceedsCzk).toBe('120000.00')
    expect(summary.taxable.costCzk).toBe('24000.00')
    expect(summary.taxable.gainCzk).toBe('96000.00')
    expect(summary.sales.find((s) => s.saleId === 2)!.taxable).toBe(false)
  })

  it('losses inside the year offset gains, and the s. 10(4) base never goes negative', () => {
    const gain = match({ saleId: 1, salePricePerShare: '600' }) // +120 000 - 24 000
    const loss = match({
      saleId: 2,
      salePricePerShare: '10',
      parts: [part({ lotId: 3, acquiredAt: new Date('2025-06-01T00:00:00Z') })],
    }) // 2 400 - 24 000
    const summary = summarizeYear(2026, [gain, loss], noDividends, noInterest, fx)

    expect(summary.taxable.gainCzk).toBe('98400.00')
    expect(summary.taxable.baseCzk).toBe('98400.00')
  })

  it('a year that is a net loss reports the loss but a zero base', () => {
    const loss = match({
      saleId: 1,
      salePricePerShare: '500',
      parts: [part({ quantity: '100', lotQuantity: '100', lotPricePerShare: '900' })],
    }) // proceeds 1 200 000, cost 2 160 000
    const summary = summarizeYear(2026, [loss], noDividends, noInterest, fx)

    expect(summary.under100kExemption).toBe(false)
    expect(summary.taxable.gainCzk).toBe('-960000.00')
    expect(summary.taxable.baseCzk).toBe('0.00')
  })

  it('lot cost converts with the LOT currency, not the sale currency', () => {
    const mixed = match({
      saleId: 1,
      salePricePerShare: '600',
      parts: [part({ lotId: 4, lotCurrency: 'EUR' })],
    })
    const summary = summarizeYear(2026, [mixed], noDividends, noInterest, fx)

    expect(summary.taxable.costCzk).toBe('25000.00')
    expect(codes(summary)).toContain('currencyMismatch')
  })

  it('sales from other years are ignored', () => {
    const other = match({ saleId: 1, soldAt: new Date('2025-03-01T10:00:00Z') })
    const summary = summarizeYear(2026, [other], noDividends, noInterest, fx)
    expect(summary.totalSaleProceedsCzk).toBe('0.00')
    expect(summary.sales).toHaveLength(0)
  })

  it('a late-UTC December sale belongs to the next Prague year', () => {
    // 31 Dec 2025 23:30 UTC is 1 Jan 2026 00:30 in Prague
    const boundary = match({ saleId: 1, soldAt: new Date('2025-12-31T23:30:00Z') })
    expect(summarizeYear(2025, [boundary], noDividends, noInterest, fx).sales).toHaveLength(0)
    expect(summarizeYear(2026, [boundary], noDividends, noInterest, fx).sales).toHaveLength(1)
  })

  it('unmatched quantity consumes the limit and is taxed with zero cost above it', () => {
    const summary = summarizeYear(2026, [match({ saleId: 1, unmatchedQuantity: '90' })], noDividends, noInterest, fx)
    expect(summary.limitProceedsCzk).toBe('360000.00')
    expect(summary.under100kExemption).toBe(false)
    const unmatchedRow = summary.sales.find((s) => s.lotId === 0)!
    expect(unmatchedRow.proceedsCzk).toBe('324000.00')
    expect(unmatchedRow.costCzk).toBe('0.00')
    expect(unmatchedRow.taxable).toBe(true)
    expect(codes(summary)).toContain('unmatchedSale')
  })

  it('a small unmatched quantity does not flip the exemption but still warns', () => {
    const summary = summarizeYear(2026, [match({ saleId: 1, unmatchedQuantity: '1' })], noDividends, noInterest, fx)
    expect(summary.under100kExemption).toBe(true)
    expect(summary.sales.find((s) => s.lotId === 0)!.taxable).toBe(false)
    expect(codes(summary)).toContain('unmatchedSale')
  })
})

describe('summarizeYear - fees', () => {
  const withFees = (): SaleMatch =>
    match({
      saleId: 1,
      salePricePerShare: '500',
      fee: '120',
      feeCurrency: 'CZK',
      parts: [part({ lotFee: '240', lotFeeCurrency: 'CZK', lotQuantity: '20', quantity: '10' })],
    })

  it('folds the matched share of the acquisition and sale fee into cost (s. 10(5))', () => {
    const summary = summarizeYear(2026, [withFees()], noDividends, noInterest, fx)
    const row = summary.sales[0]!
    // half the lot was sold, so half its 240 CZK fee applies; the whole 120 CZK sale fee applies
    expect(row.feeCzk).toBe('240.00')
    expect(row.costCzk).toBe('24240.00')
    expect(row.proceedsCzk).toBe('120000.00')
    expect(row.gainCzk).toBe('95760.00')
  })

  it('the 100k limit measures gross proceeds, fees are an expense not a discount', () => {
    const summary = summarizeYear(2026, [withFees()], noDividends, noInterest, fx)
    expect(summary.limitProceedsCzk).toBe('120000.00')
  })

  it('the unmatched part carries its share of the sale fee as its only cost', () => {
    const sale = match({
      saleId: 1,
      salePricePerShare: '500',
      fee: '100',
      feeCurrency: 'CZK',
      unmatchedQuantity: '10',
    })
    const summary = summarizeYear(2026, [sale], noDividends, noInterest, fx)
    expect(summary.sales.find((s) => s.lotId === 0)!.costCzk).toBe('50.00')
  })

  it('a fee on a zero-quantity sale contributes nothing instead of dividing by zero', () => {
    const sale = match({ saleId: 1, quantity: '0', fee: '100', feeCurrency: 'CZK', parts: [part({ quantity: '0' })] })
    const summary = summarizeYear(2026, [sale], noDividends, noInterest, fx)
    expect(summary.sales[0]!.feeCzk).toBe('0.00')
  })
})

describe('summarizeYear - the 40M exemption cap', () => {
  // s. 4(3) capped time-test-exempt income for 2025 only: the 2026 amendment dropped it again for
  // securities and kept it for crypto-assets, which this app does not track.
  const hugeExempt = (year: number, proceeds: string): SaleMatch =>
    match({
      saleId: 1,
      soldAt: new Date(`${year}-03-01T10:00:00Z`),
      salePricePerShare: proceeds,
      parts: [
        part({ quantity: '1', lotQuantity: '1', acquiredAt: new Date('2018-01-01T00:00:00Z'), timeTestMet: true }),
      ],
    })

  it('reports nothing over the cap when 2025 exempt proceeds stay below it', () => {
    // 1 500 000 USD x 24 = 36 000 000 CZK
    const summary = summarizeYear(2025, [hugeExempt(2025, '1500000')], noDividends, noInterest, fx)
    expect(summary.exemptProceedsOverCapCzk).toBe('0.00')
    expect(codes(summary)).not.toContain('exemptOverCap')
  })

  it('reports the 2025 overflow above 40 000 000 CZK', () => {
    // 2 000 000 USD x 24 = 48 000 000 CZK, 8 000 000 over the cap
    const summary = summarizeYear(2025, [hugeExempt(2025, '2000000')], noDividends, noInterest, fx)
    expect(summary.exemptProceedsOverCapCzk).toBe('8000000.00')
    expect(codes(summary)).toContain('exemptOverCap')
  })

  it('does not apply before 2025, when the cap did not exist', () => {
    const summary = summarizeYear(2024, [hugeExempt(2024, '2000000')], noDividends, noInterest, fx)
    expect(summary.exemptProceedsOverCapCzk).toBe('0.00')
    expect(codes(summary)).not.toContain('exemptOverCap')
  })

  it('does not apply in 2026 either, once securities were taken back out of the cap', () => {
    const summary = summarizeYear(2026, [hugeExempt(2026, '2000000')], noDividends, noInterest, fx)
    expect(summary.exemptProceedsOverCapCzk).toBe('0.00')
    expect(codes(summary)).not.toContain('exemptOverCap')
  })
})

describe('summarizeYear - dividends and interest', () => {
  const dividend: TaxDividend = {
    instrumentId: 1,
    instrumentKey: 'AAPL_US_EQ',
    reference: 'div-abc',
    netAmount: '204',
    netCurrency: 'CZK',
    grossAmountPerShare: '1',
    quantity: '10',
    grossCurrency: 'USD',
    paidOn: new Date('2026-02-15T10:00:00Z'),
    type: 'ORDINARY',
    country: 'US',
  }

  it('computes gross in CZK and withholding as gross minus net', () => {
    // gross = 1 USD x 10 x 24 = 240 CZK, net 204 CZK, withheld 36 (15 %)
    const summary = summarizeYear(2026, [], [dividend], noInterest, fx)
    expect(summary.dividends.grossCzk).toBe('240.00')
    expect(summary.dividends.netCzk).toBe('204.00')
    expect(summary.dividends.withheldCzk).toBe('36.00')
    expect(summary.dividends.items).toHaveLength(1)
    expect(summary.dividends.items[0]!.effectiveRate).toBe('15.00')
  })

  it('a net amount in a foreign currency converts with its own rate', () => {
    const usdNet: TaxDividend = { ...dividend, netAmount: '8.5', netCurrency: 'USD' }
    const summary = summarizeYear(2026, [], [usdNet], noInterest, fx)
    expect(summary.dividends.netCzk).toBe('204.00')
    expect(summary.dividends.withheldCzk).toBe('36.00')
  })

  it('a dividend without a gross amount falls back to net and warns', () => {
    const noGross: TaxDividend = { ...dividend, grossAmountPerShare: null, quantity: null }
    const summary = summarizeYear(2026, [], [noGross], noInterest, fx)
    expect(summary.dividends.grossCzk).toBe('204.00')
    expect(summary.dividends.withheldCzk).toBe('0.00')
    expect(codes(summary)).toContain('dividendGrossMissing')
  })

  it('a net above gross within tolerance clamps withholding to zero silently', () => {
    // broker FX rounding: 240.50 net against 240 gross is under the 1 CZK floor
    const rounding: TaxDividend = { ...dividend, netAmount: '240.5' }
    const summary = summarizeYear(2026, [], [rounding], noInterest, fx)
    expect(summary.dividends.withheldCzk).toBe('0.00')
    expect(codes(summary)).not.toContain('withholdingNegative')
  })

  it('a net far above gross clamps to zero and says the data is wrong', () => {
    const broken: TaxDividend = { ...dividend, netAmount: '300' }
    const summary = summarizeYear(2026, [], [broken], noInterest, fx)
    expect(summary.dividends.withheldCzk).toBe('0.00')
    expect(codes(summary)).toContain('withholdingNegative')
  })

  it('a zero gross dividend reports a zero effective rate instead of dividing by zero', () => {
    const zero: TaxDividend = { ...dividend, netAmount: '0', grossAmountPerShare: '0' }
    const summary = summarizeYear(2026, [], [zero], noInterest, fx)
    expect(summary.dividends.items[0]!.effectiveRate).toBe('0.00')
  })

  it('dividends from other years are ignored', () => {
    const other: TaxDividend = { ...dividend, paidOn: new Date('2025-02-15T10:00:00Z') }
    const summary = summarizeYear(2026, [], [other], noInterest, fx)
    expect(summary.dividends.items).toHaveLength(0)
    expect(summary.dividends.grossCzk).toBe('0.00')
  })

  it('sums interest on cash for the year in CZK', () => {
    const interest: TaxInterest[] = [
      { amount: '10', currency: 'CZK', occurredAt: new Date('2026-01-05T10:00:00Z') },
      { amount: '1', currency: 'USD', occurredAt: new Date('2026-01-06T10:00:00Z') },
      { amount: '99', currency: 'CZK', occurredAt: new Date('2025-01-06T10:00:00Z') },
    ]
    const summary = summarizeYear(2026, [], noDividends, interest, fx)
    expect(summary.interestCzk).toBe('34.00')
  })
})

describe('summarizeYear - withholding credit inputs', () => {
  const usDividend = (overrides: Partial<TaxDividend> = {}): TaxDividend => ({
    instrumentId: 1,
    instrumentKey: 'AAPL_US_EQ',
    reference: `div-${overrides.netAmount ?? 'x'}`,
    netAmount: '204',
    netCurrency: 'CZK',
    grossAmountPerShare: '1',
    quantity: '10',
    grossCurrency: 'USD',
    paidOn: new Date('2026-02-15T10:00:00Z'),
    type: 'ORDINARY',
    country: 'US',
    ...overrides,
  })

  it('caps a 30 % US withholding at the 15 % treaty rate and flags the excess', () => {
    // no W-8BEN: 240 gross, 168 net, 72 withheld = 30 %; only 36 is creditable
    const summary = summarizeYear(2026, [], [usDividend({ netAmount: '168' })], noInterest, fx)
    const item = summary.dividends.items[0]!
    expect(item.withheldCzk).toBe('72.00')
    expect(item.effectiveRate).toBe('30.00')
    expect(item.treatyRate).toBe('15.00')
    expect(item.creditableCzk).toBe('36.00')
    expect(summary.dividends.creditableCzk).toBe('36.00')
    expect(codes(summary)).toContain('treatyExceeded')
  })

  it('a hair over the treaty rate is the broker rounding, not a missing W-8BEN', () => {
    // 240 gross, 203.90 net: 36.10 withheld is 15.04 %, four hundredths of a point over
    const summary = summarizeYear(2026, [], [usDividend({ netAmount: '203.90' })], noInterest, fx)
    expect(codes(summary)).not.toContain('treatyExceeded')
    // the row is not painted as a breach either - one judgement, made on the server
    expect(summary.dividends.items[0]!.overTreaty).toBe(false)
    // the cap still applies - it can only ever understate the credit
    expect(summary.dividends.items[0]!.creditableCzk).toBe('36.00')
  })

  // A crown of tolerance would hide every one of these: on fractional holdings no single
  // withholding reaches a crown, which is exactly why the judgement is in percentage points.
  const smallDividend = (overrides: Partial<TaxDividend>): TaxDividend =>
    usDividend({ netCurrency: 'CZK', grossCurrency: 'CZK', quantity: '1', ...overrides })

  it('a source state withholding at its domestic rate is flagged however small the amount', () => {
    // Canada withholds 25 % where the treaty allows 15 %: 0.36 CZK on a 1.44 CZK dividend
    const canadian = smallDividend({ country: 'CA', grossAmountPerShare: '1.44', netAmount: '1.08' })
    const summary = summarizeYear(2026, [], [canadian], noInterest, fx)

    expect(summary.dividends.items[0]!.effectiveRate).toBe('25.00')
    expect(codes(summary)).toContain('treatyExceeded')
    expect(summary.dividends.items[0]!.overTreaty).toBe(true)
    // only the treaty rate is creditable; the rest is reclaimed from Canada
    expect(summary.dividends.items[0]!.creditableCzk).toBe('0.22')
  })

  it('stays quiet when the payment is too small for the implied rate to mean anything', () => {
    // 0.11 CZK gross: one heller of rounding moves the implied rate by nine points
    const crumb = smallDividend({ grossAmountPerShare: '0.11', netAmount: '0.09' })
    const summary = summarizeYear(2026, [], [crumb], noInterest, fx)

    expect(Number(summary.dividends.items[0]!.effectiveRate)).toBeGreaterThan(18)
    expect(codes(summary)).not.toContain('treatyExceeded')
  })

  it('withholding below the treaty rate is creditable in full', () => {
    const summary = summarizeYear(2026, [], [usDividend({ netAmount: '216' })], noInterest, fx)
    expect(summary.dividends.creditableCzk).toBe('24.00')
    expect(codes(summary)).not.toContain('treatyExceeded')
  })

  it('groups foreign income by source state', () => {
    const summary = summarizeYear(
      2026,
      [],
      [usDividend(), usDividend({ reference: 'div-de', country: 'DE', instrumentKey: 'SAP_DE' })],
      noInterest,
      fx,
    )
    expect(summary.dividends.byCountry.map((row) => row.country)).toEqual(['DE', 'US'])
    expect(summary.dividends.foreignGrossCzk).toBe('480.00')
  })

  it('an unknown source state is credited uncapped but says so', () => {
    const summary = summarizeYear(2026, [], [usDividend({ country: 'UNKNOWN' })], noInterest, fx)
    expect(summary.dividends.items[0]!.treatyRate).toBeNull()
    expect(summary.dividends.creditableCzk).toBe('36.00')
    expect(codes(summary)).toContain('treatyUnknown')
  })

  it('an unknown source state with nothing withheld raises no treaty warning', () => {
    const summary = summarizeYear(2026, [], [usDividend({ country: 'UNKNOWN', netAmount: '240' })], noInterest, fx)
    expect(codes(summary)).not.toContain('treatyUnknown')
  })

  it('an ordinary UK dividend withholds nothing, so there is nothing to credit or flag', () => {
    const uk = usDividend({ country: 'GB', instrumentKey: 'BP_GB', netAmount: '240' })
    const summary = summarizeYear(2026, [], [uk], noInterest, fx)
    expect(summary.dividends.items[0]!.withheldCzk).toBe('0.00')
    expect(summary.dividends.items[0]!.creditableCzk).toBe('0.00')
    expect(codes(summary)).not.toContain('treatyExceeded')
  })

  it("a UK REIT's property income distribution is withheld at 20 % and capped at the treaty 15 %", () => {
    // The one case where the UK cap bites: 240 gross, 192 net, 48 withheld = 20 %
    const reit = usDividend({ country: 'GB', instrumentKey: 'SGRO_GB', netAmount: '192' })
    const summary = summarizeYear(2026, [], [reit], noInterest, fx)
    expect(summary.dividends.items[0]!.effectiveRate).toBe('20.00')
    expect(summary.dividends.items[0]!.creditableCzk).toBe('36.00')
    expect(codes(summary)).toContain('treatyExceeded')
  })

  it('a Czech-source dividend stays out of the foreign base and out of the credit', () => {
    const summary = summarizeYear(2026, [], [usDividend({ country: 'CZ', instrumentKey: 'CEZ' })], noInterest, fx)
    expect(summary.dividends.grossCzk).toBe('240.00')
    expect(summary.dividends.foreignGrossCzk).toBe('0.00')
    expect(summary.dividends.domesticGrossCzk).toBe('240.00')
    expect(summary.dividends.domesticWithheldCzk).toBe('36.00')
    expect(summary.dividends.byCountry).toHaveLength(0)
    expect(codes(summary)).toContain('domesticDividend')
  })

  it('warns once per instrument about domestic dividends, not once per payment', () => {
    const summary = summarizeYear(
      2026,
      [],
      [usDividend({ country: 'CZ', instrumentKey: 'CEZ' }), usDividend({ country: 'CZ', instrumentKey: 'CEZ' })],
      noInterest,
      fx,
    )
    expect(codes(summary).filter((code) => code === 'domesticDividend')).toHaveLength(1)
  })
})
