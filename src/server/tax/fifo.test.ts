import { describe, expect, it } from 'vitest'
import { fifoMatch, type TaxLot, type TaxSale } from './fifo.js'

function lot(overrides: Partial<TaxLot> & { lotId: number }): TaxLot {
  return {
    quantity: '10',
    pricePerShare: '100',
    currency: 'USD',
    acquiredAt: new Date('2022-01-10T10:00:00Z'),
    fee: null,
    feeCurrency: null,
    ...overrides,
  }
}

function sale(overrides: Partial<TaxSale> & { saleId: number }): TaxSale {
  return {
    quantity: '10',
    pricePerShare: '150',
    currency: 'USD',
    soldAt: new Date('2024-06-01T10:00:00Z'),
    fee: null,
    feeCurrency: null,
    ...overrides,
  }
}

describe('fifoMatch', () => {
  it('matches a full sale against a single older lot', () => {
    const result = fifoMatch([lot({ lotId: 1 })], [sale({ saleId: 100 })])

    expect(result.matches).toHaveLength(1)
    const match = result.matches[0]!
    expect(match.parts).toEqual([
      {
        lotId: 1,
        quantity: '10',
        lotPricePerShare: '100',
        lotCurrency: 'USD',
        acquiredAt: new Date('2022-01-10T10:00:00Z'),
        timeTestMet: false,
        lotQuantity: '10',
        lotFee: null,
        lotFeeCurrency: null,
      },
    ])
    expect(match.unmatchedQuantity).toBe('0')
    expect(result.openLots).toHaveLength(0)
  })

  it('partial sale leaves the rest of the lot open with exemptFrom date', () => {
    const result = fifoMatch([lot({ lotId: 1 })], [sale({ saleId: 100, quantity: '4' })])

    expect(result.matches[0]!.parts[0]!.quantity).toBe('4')
    expect(result.openLots).toEqual([
      {
        lotId: 1,
        remainingQuantity: '6',
        pricePerShare: '100',
        currency: 'USD',
        acquiredAt: new Date('2022-01-10T10:00:00Z'),
        // the first EXEMPT day is the day after the third anniversary
        exemptFrom: new Date('2025-01-11T00:00:00Z'),
      },
    ])
  })

  it('a sale spanning two lots consumes them oldest-first (FIFO)', () => {
    const result = fifoMatch(
      [
        lot({ lotId: 2, acquiredAt: new Date('2023-05-01T00:00:00Z'), pricePerShare: '120', quantity: '5' }),
        lot({ lotId: 1, acquiredAt: new Date('2021-01-01T00:00:00Z'), pricePerShare: '80', quantity: '5' }),
      ],
      [sale({ saleId: 100, quantity: '8' })],
    )

    const parts = result.matches[0]!.parts
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ lotId: 1, quantity: '5', lotPricePerShare: '80', timeTestMet: true })
    expect(parts[1]).toMatchObject({ lotId: 2, quantity: '3', lotPricePerShare: '120', timeTestMet: false })
    expect(result.openLots[0]).toMatchObject({ lotId: 2, remainingQuantity: '2' })
  })

  it('two sales drain lots sequentially', () => {
    const result = fifoMatch(
      [lot({ lotId: 1, quantity: '10' })],
      [
        sale({ saleId: 100, quantity: '6', soldAt: new Date('2024-06-01T00:00:00Z') }),
        sale({ saleId: 101, quantity: '4', soldAt: new Date('2024-07-01T00:00:00Z') }),
      ],
    )
    expect(result.matches[0]!.parts[0]!.quantity).toBe('6')
    expect(result.matches[1]!.parts[0]!.quantity).toBe('4')
    expect(result.openLots).toHaveLength(0)
  })

  it('a sale that exactly drains lot 1 breaks before touching lot 2; the next sale skips the drained lot', () => {
    const result = fifoMatch(
      [
        lot({ lotId: 1, quantity: '5', acquiredAt: new Date('2021-01-01T00:00:00Z') }),
        lot({ lotId: 2, quantity: '5', acquiredAt: new Date('2023-01-01T00:00:00Z') }),
      ],
      [
        sale({ saleId: 100, quantity: '5', soldAt: new Date('2024-06-01T00:00:00Z') }),
        sale({ saleId: 101, quantity: '2', soldAt: new Date('2024-07-01T00:00:00Z') }),
      ],
    )
    expect(result.matches[0]!.parts).toEqual([expect.objectContaining({ lotId: 1, quantity: '5' })])
    expect(result.matches[1]!.parts).toEqual([expect.objectContaining({ lotId: 2, quantity: '2' })])
    expect(result.openLots).toEqual([expect.objectContaining({ lotId: 2, remainingQuantity: '3' })])
  })

  it('sale without enough lots reports unmatched quantity (split / missing data)', () => {
    const result = fifoMatch([lot({ lotId: 1, quantity: '3' })], [sale({ saleId: 100, quantity: '10' })])
    expect(result.matches[0]!.unmatchedQuantity).toBe('7')
    expect(result.matches[0]!.parts[0]!.quantity).toBe('3')
  })

  it('time test boundary: sale exactly on the 3-year anniversary does NOT pass, a day later does', () => {
    const acquired = new Date('2021-06-01T00:00:00Z')
    const onAnniversary = fifoMatch(
      [lot({ lotId: 1, acquiredAt: acquired })],
      [sale({ saleId: 100, soldAt: new Date('2024-06-01T00:00:00Z') })],
    )
    expect(onAnniversary.matches[0]!.parts[0]!.timeTestMet).toBe(false)

    const dayAfter = fifoMatch(
      [lot({ lotId: 1, acquiredAt: acquired })],
      [sale({ saleId: 101, soldAt: new Date('2024-06-02T05:00:00Z') })],
    )
    expect(dayAfter.matches[0]!.parts[0]!.timeTestMet).toBe(true)
  })

  it('time test compares calendar days, not timestamps - a later hour on the anniversary still fails', () => {
    const result = fifoMatch(
      [lot({ lotId: 1, acquiredAt: new Date('2021-06-01T09:00:00Z') })],
      [sale({ saleId: 100, soldAt: new Date('2024-06-01T15:00:00Z') })],
    )
    expect(result.matches[0]!.parts[0]!.timeTestMet).toBe(false)
  })

  it('time test uses the Prague calendar day - a late-UTC sale falls on the next local day', () => {
    // 22:30 UTC is 00:30 the next day in Prague (summer time), so the day AFTER the anniversary
    const result = fifoMatch(
      [lot({ lotId: 1, acquiredAt: new Date('2021-06-01T09:00:00Z') })],
      [sale({ saleId: 100, soldAt: new Date('2024-06-01T22:30:00Z') })],
    )
    expect(result.matches[0]!.parts[0]!.timeTestMet).toBe(true)
  })

  it('lots sharing a timestamp are consumed in id order, whatever order they arrive in', () => {
    const sameDay = new Date('2022-01-10T10:00:00Z')
    const forward = fifoMatch(
      [
        lot({ lotId: 7, acquiredAt: sameDay, pricePerShare: '70' }),
        lot({ lotId: 3, acquiredAt: sameDay, pricePerShare: '30' }),
      ],
      [sale({ saleId: 100, quantity: '10' })],
    )
    const reversed = fifoMatch(
      [
        lot({ lotId: 3, acquiredAt: sameDay, pricePerShare: '30' }),
        lot({ lotId: 7, acquiredAt: sameDay, pricePerShare: '70' }),
      ],
      [sale({ saleId: 100, quantity: '10' })],
    )
    expect(forward.matches[0]!.parts[0]!.lotId).toBe(3)
    expect(reversed.matches[0]!.parts[0]!.lotId).toBe(3)
  })

  it('sales sharing a timestamp are processed in id order', () => {
    const sameDay = new Date('2024-06-01T10:00:00Z')
    const result = fifoMatch(
      [lot({ lotId: 1, quantity: '5' })],
      [sale({ saleId: 200, soldAt: sameDay, quantity: '5' }), sale({ saleId: 100, soldAt: sameDay, quantity: '5' })],
    )
    expect(result.matches[0]!.saleId).toBe(100)
    expect(result.matches[0]!.parts).toHaveLength(1)
    expect(result.matches[1]!.unmatchedQuantity).toBe('5')
  })

  it('carries the lot fee and the whole lot quantity onto every matched part', () => {
    const result = fifoMatch(
      [lot({ lotId: 1, quantity: '10', fee: '25', feeCurrency: 'CZK' })],
      [sale({ saleId: 100, quantity: '4', fee: '9', feeCurrency: 'CZK' })],
    )
    expect(result.matches[0]!.parts[0]).toMatchObject({ lotQuantity: '10', lotFee: '25', lotFeeCurrency: 'CZK' })
    expect(result.matches[0]).toMatchObject({ fee: '9', feeCurrency: 'CZK', quantity: '4' })
  })

  it('fractional quantities match exactly', () => {
    const result = fifoMatch([lot({ lotId: 1, quantity: '0.256047' })], [sale({ saleId: 100, quantity: '0.1' })])
    expect(result.matches[0]!.parts[0]!.quantity).toBe('0.1')
    expect(result.openLots[0]!.remainingQuantity).toBe('0.156047')
  })
})
