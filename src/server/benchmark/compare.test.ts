import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { AppError } from '../errors.js'
import { type BenchmarkInput, compareToBenchmark } from './compare.js'

const lookup = (table: Record<string, string>) => (day: string) =>
  table[day] === undefined ? null : new Decimal(table[day])

function input(overrides: Partial<BenchmarkInput> = {}): BenchmarkInput {
  return {
    flows: [{ day: '2023-01-02', amountCzk: new Decimal(10_000) }],
    portfolioValueCzk: new Decimal(12_000),
    asOf: '2024-01-02',
    closeOn: lookup({ '2023-01-02': '100', '2024-01-02': '120' }),
    usdRate: lookup({ '2023-01-02': '22.5', '2024-01-02': '25' }),
    ...overrides,
  }
}

describe('compareToBenchmark', () => {
  it('replays one deposit into the index and values both sides on the same day', () => {
    const result = compareToBenchmark(input())

    expect(result.since).toBe('2023-01-02')
    expect(result.asOf).toBe('2024-01-02')
    expect(result.netInvestedCzk).toBe('10000.00')
    expect(result.portfolioValueCzk).toBe('12000.00')
    // 10 000 CZK / 22.5 = 444.44 USD -> 4.4444 units -> * 120 * 25
    expect(result.benchmarkValueCzk).toBe('13333.33')
    expect(result.differenceCzk).toBe('-1333.33')
    expect(result.differencePct).toBe('-10.00')
    expect(result.portfolioGainCzk).toBe('2000.00')
    expect(result.benchmarkGainCzk).toBe('3333.33')
    // 365 days apart, so XIRR is the plain return
    expect(result.portfolioXirrPct).toBe('20.00')
    expect(result.benchmarkXirrPct).toBe('33.33')
    expect(result.alphaPp).toBe('-13.33')
  })

  it('a withdrawal sells index units at that day close', () => {
    const result = compareToBenchmark(
      input({
        flows: [
          { day: '2023-01-02', amountCzk: new Decimal(1000) },
          { day: '2023-07-03', amountCzk: new Decimal(-500) },
        ],
        portfolioValueCzk: new Decimal(1500),
        closeOn: lookup({ '2023-01-02': '100', '2023-07-03': '200', '2024-01-02': '200' }),
        usdRate: () => new Decimal(1),
      }),
    )
    // 10 units bought, 2.5 sold, 7.5 left at 200
    expect(result.benchmarkValueCzk).toBe('1500.00')
    expect(result.netInvestedCzk).toBe('500.00')
    expect(result.differenceCzk).toBe('0.00')
    expect(result.alphaPp).toBe('0.00')
  })

  it('reports which day lacks an index close or a rate', () => {
    expect(() => compareToBenchmark(input({ closeOn: () => null }))).toThrow(
      expect.objectContaining({ code: 'BENCHMARK_PRICE_MISSING', message: expect.stringContaining('2023-01-02') }),
    )
    expect(() => compareToBenchmark(input({ usdRate: lookup({ '2023-01-02': '22.5' }) }))).toThrow(
      expect.objectContaining({ code: 'BENCHMARK_FX_MISSING', message: expect.stringContaining('2024-01-02') }),
    )
  })

  it('refuses an empty flow list', () => {
    expect(() => compareToBenchmark(input({ flows: [] }))).toThrow(AppError)
  })
})
