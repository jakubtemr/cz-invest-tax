import { call, ORPCError } from '@orpc/server'
import { describe, expect, it, vi } from 'vitest'
import { AppError } from './errors.js'
import type { ManualService } from './manual/manual-service.js'
import type { PortfolioService } from './portfolio/portfolio-service.js'
import { createRouter } from './router.js'

// stub services - the router test covers only the boundary: input validation and error mapping
function makeRouter(overrides: { addLot?: ManualService['addLot']; removeLot?: ManualService['removeLot'] } = {}) {
  const manual = {
    addLot: overrides.addLot ?? vi.fn().mockResolvedValue({ lotId: 1, instrumentId: 1 }),
    removeLot: overrides.removeLot ?? vi.fn().mockResolvedValue(undefined),
    setPrice: vi.fn().mockResolvedValue(undefined),
  } as unknown as ManualService
  const portfolio = { overview: vi.fn() } as unknown as PortfolioService
  const tax = { overview: vi.fn() } as unknown as import('./tax/tax-service.js').TaxService
  return createRouter({ portfolio, manual, sync: null, tax })
}

const validLot = {
  ticker: 'INTC.US',
  name: 'Intel',
  currency: 'usd',
  quantity: '10',
  pricePerShare: '30.5',
  acquiredAt: '2024-06-01',
}

describe('router input validation', () => {
  it('accepts a valid lot and normalizes currency to uppercase', async () => {
    const addLot = vi.fn().mockResolvedValue({ lotId: 1, instrumentId: 1 })
    const router = makeRouter({ addLot: addLot as unknown as ManualService['addLot'] })
    await call(router.manual.addLot, validLot)
    expect(addLot).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD', acquiredAt: new Date('2024-06-01') }),
    )
  })

  it.each([
    ['zero quantity', { ...validLot, quantity: '0' }],
    ['zero with decimals', { ...validLot, quantity: '0.00' }],
    ['non-numeric price', { ...validLot, pricePerShare: '30,5' }],
    ['non-letter currency', { ...validLot, currency: '1a2' }],
    ['overlong ticker', { ...validLot, ticker: 'X'.repeat(33) }],
    ['bad date', { ...validLot, acquiredAt: '01/06/2024' }],
  ])('rejects %s', async (_label, input) => {
    await expect(call(makeRouter().manual.addLot, input)).rejects.toThrow(ORPCError)
  })
})

describe('router error mapping', () => {
  it('maps AppError *_NOT_FOUND to NOT_FOUND with readable message', async () => {
    const removeLot = vi.fn().mockRejectedValue(new AppError('Manual lot 7 not found', 'LOT_NOT_FOUND'))
    const router = makeRouter({ removeLot: removeLot as unknown as ManualService['removeLot'] })
    const error = await call(router.manual.removeLot, { lotId: 7 }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ORPCError)
    expect((error as ORPCError<string, unknown>).status).toBe(404)
    expect((error as ORPCError<string, unknown>).message).toContain('LOT_NOT_FOUND')
  })

  it('sync without configured client returns readable BAD_REQUEST', async () => {
    const error = await call(makeRouter().sync.t212, undefined).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ORPCError)
    expect((error as ORPCError<string, unknown>).message).toContain('T212_API_KEY')
  })
})
