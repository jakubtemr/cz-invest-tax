import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import type { OpenLot } from './fifo.js'
import { reconcileOpenLots, reconcileWarning } from './reconcile.js'

const ACQUIRED = new Date('2022-01-10T10:00:00Z')
const EXEMPT_FROM = new Date('2025-01-11T00:00:00Z')

function lot(overrides: Partial<OpenLot> = {}): OpenLot {
  return {
    lotId: 1,
    remainingQuantity: '10',
    pricePerShare: '100',
    currency: 'USD',
    acquiredAt: ACQUIRED,
    exemptFrom: EXEMPT_FROM,
    ...overrides,
  }
}

describe('reconcileOpenLots', () => {
  it('leaves lots alone when the broker is silent', () => {
    const result = reconcileOpenLots([lot()], null)
    expect(result.kind).toBeNull()
    expect(result.lots[0]!.remainingQuantity).toBe('10')
  })

  it('leaves lots alone when the quantities already agree', () => {
    const result = reconcileOpenLots([lot()], new Decimal('10'))
    expect(result.kind).toBeNull()
  })

  it('a split rescales quantity and price and KEEPS the acquisition date', () => {
    // 10 shares became 20: the holding period does not restart, so the time test survives
    const result = reconcileOpenLots([lot()], new Decimal('20'))
    expect(result.kind).toBe('split')
    expect(result.ratio).toBe('1:2')
    expect(result.lots[0]!.remainingQuantity).toBe('20')
    expect(result.lots[0]!.pricePerShare).toBe('50')
    expect(result.lots[0]!.acquiredAt).toEqual(ACQUIRED)
    expect(result.lots[0]!.exemptFrom).toEqual(EXEMPT_FROM)
  })

  it('names a reverse split ratio too', () => {
    const result = reconcileOpenLots([lot()], new Decimal('2'))
    expect(result.kind).toBe('split')
    expect(result.ratio).toBe('5:1')
    expect(result.lots[0]!.pricePerShare).toBe('500')
  })

  it('a drift that is not a clean ratio is adjusted, not named a split', () => {
    const result = reconcileOpenLots([lot()], new Decimal('10.37'))
    expect(result.kind).toBe('adjusted')
    expect(result.ratio).toBeNull()
    expect(result.lots[0]!.remainingQuantity).toBe('10.37')
  })

  it('rescales every lot of the group by the same factor', () => {
    const result = reconcileOpenLots([lot({ lotId: 1, remainingQuantity: '4' }), lot({ lotId: 2 })], new Decimal('28'))
    expect(result.lots.map((row) => row.remainingQuantity)).toEqual(['8', '20'])
  })

  it('a broker quantity of zero closes the holding', () => {
    const result = reconcileOpenLots([lot()], new Decimal('0'))
    expect(result.kind).toBe('closed')
    expect(result.lots).toHaveLength(0)
  })

  it('shares the broker knows about with no purchase behind them are unexplained, not rescaled', () => {
    const result = reconcileOpenLots([lot({ remainingQuantity: '0' })], new Decimal('5'))
    expect(result.kind).toBe('unexplained')
    expect(result.lots[0]!.remainingQuantity).toBe('0')
  })
})

describe('reconcileWarning', () => {
  it('says nothing when nothing was reconciled', () => {
    expect(reconcileWarning({ lots: [], kind: null, ratio: null }, 'AAPL', '10', '10')).toBeNull()
  })

  it('carries the ratio and marks a split as informational', () => {
    const warning = reconcileWarning({ lots: [], kind: 'split', ratio: '1:2' }, 'AAPL', '20', '10')!
    expect(warning.code).toBe('reconcile.split')
    expect(warning.severity).toBe('info')
    expect(warning.params).toMatchObject({ instrument: 'AAPL', broker: '20', history: '10', ratio: '1:2' })
  })

  it('an unexplained difference is an error, not a note', () => {
    const warning = reconcileWarning({ lots: [], kind: 'unexplained', ratio: null }, 'AAPL', '5', '0')!
    expect(warning.severity).toBe('error')
    expect(warning.params.ratio).toBe('')
  })
})
