import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import type { SaleMatch } from './fifo.js'
import { collectYears, filterPriced, totalLookup } from './overview.js'
import type { TaxDividend, TaxInterest } from './types.js'

// These run without a database: that is the point of keeping them out of TaxService.

const czk = (): Decimal => new Decimal(1)
const rate = (_date: Date, currency: string): Decimal | null => (currency === 'PLN' ? null : czk())

function match(overrides: Partial<SaleMatch> = {}): SaleMatch {
  return {
    saleId: 1,
    instrumentKey: 'AAPL_US_EQ',
    soldAt: new Date('2026-03-01T10:00:00Z'),
    currency: 'USD',
    salePricePerShare: '100',
    quantity: '1',
    fee: null,
    feeCurrency: null,
    unmatchedQuantity: '0',
    parts: [
      {
        lotId: 1,
        quantity: '1',
        lotPricePerShare: '50',
        lotCurrency: 'USD',
        acquiredAt: new Date('2025-01-10T00:00:00Z'),
        timeTestMet: false,
        lotQuantity: '1',
        lotFee: null,
        lotFeeCurrency: null,
      },
    ],
    ...overrides,
  }
}

describe('filterPriced', () => {
  it('keeps an item whose every leg has a rate', () => {
    const result = filterPriced(2026, [match()], [], [], rate)
    expect(result.matches).toHaveLength(1)
    expect(result.warnings).toHaveLength(0)
  })

  it('drops a sale whose LOT currency is unpriced, not only its own', () => {
    const unpricedLot = match({ parts: [{ ...match().parts[0]!, lotCurrency: 'PLN' }] })
    const result = filterPriced(2026, [unpricedLot], [], [], rate)
    expect(result.matches).toHaveLength(0)
    expect(result.warnings.map((w) => w.code)).toEqual(['itemDroppedNoRate'])
  })

  it('drops a sale whose FEE currency is unpriced', () => {
    const result = filterPriced(2026, [match({ fee: '10', feeCurrency: 'PLN' })], [], [], rate)
    expect(result.matches).toHaveLength(0)
  })

  it('ignores everything outside the year without warning about it', () => {
    const other = match({ soldAt: new Date('2025-03-01T10:00:00Z') })
    const result = filterPriced(2026, [other], [], [], rate)
    expect(result.matches).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('keeps a dividend with no gross amount without asking for the gross currency', () => {
    const dividend: TaxDividend = {
      instrumentId: 1,
      instrumentKey: 'X',
      reference: 'r',
      netAmount: '10',
      netCurrency: 'CZK',
      grossAmountPerShare: null,
      quantity: null,
      grossCurrency: 'PLN',
      paidOn: new Date('2026-02-01T00:00:00Z'),
      type: 'ORDINARY',
      country: 'US',
    }
    expect(filterPriced(2026, [], [dividend], [], rate).dividends).toHaveLength(1)
  })

  it('drops unpriced interest quietly - the currency warning already covers it', () => {
    const interest: TaxInterest[] = [{ amount: '5', currency: 'PLN', occurredAt: new Date('2026-01-05T00:00:00Z') }]
    const result = filterPriced(2026, [], [], interest, rate)
    expect(result.interest).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})

describe('totalLookup', () => {
  it('turns the nullable lookup into a total one once filtering has guaranteed the rates', () => {
    expect(totalLookup(rate)(new Date(), 'USD').toNumber()).toBe(1)
  })
})

describe('collectYears', () => {
  it('lists every year with data plus the current one, newest first', () => {
    const years = collectYears(
      [{ soldAt: new Date('2024-05-01T00:00:00Z') }] as never,
      [{ paidOn: new Date('2022-02-01T00:00:00Z') }] as never,
      [{ occurredAt: new Date('2024-01-01T00:00:00Z') }],
    )
    expect(years).toEqual([...years].sort((a, b) => b - a))
    expect(years).toContain(2024)
    expect(years).toContain(2022)
  })
})
