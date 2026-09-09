import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fxRates } from '../db/schema.js'
import { createTestDb, resetDb } from '../db/testing.js'
import { CnbFxClient } from './cnb-client.js'

const db = createTestDb()

const cnbBody = {
  rates: [
    { validFor: '2025-01-10', amount: 1, currencyCode: 'USD', rate: 24.35 },
    { validFor: '2025-01-10', amount: 100, currencyCode: 'JPY', rate: 15.42 },
  ],
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

beforeEach(async () => {
  resetDb(db)
})

describe('CnbFxClient', () => {
  it('CZK is always 1 without any fetch', async () => {
    const fetchFn = vi.fn()
    const rate = await new CnbFxClient(db, fetchFn).rate('2025-01-10', 'CZK')
    expect(rate.toNumber()).toBe(1)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches the CNB daily table, caches all currencies and returns per-unit rate', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(cnbBody))
    const client = new CnbFxClient(db, fetchFn)

    const usd = await client.rate('2025-01-10', 'USD')
    expect(usd.toNumber()).toBe(24.35)
    // JPY is quoted per 100 - rate() returns the rate for one unit
    const jpy = await client.rate('2025-01-10', 'JPY')
    expect(jpy.toNumber()).toBeCloseTo(0.1542, 6)
    // the second currency of the same day comes from the DB cache, not the API
    expect(fetchFn).toHaveBeenCalledTimes(1)

    const cached = await db.select().from(fxRates)
    expect(cached.length).toBeGreaterThanOrEqual(2)
  })

  it('a second client instance reads from the DB cache without fetching', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(cnbBody))
    await new CnbFxClient(db, fetchFn).rate('2025-01-10', 'USD')

    const fetchFn2 = vi.fn()
    const rate = await new CnbFxClient(db, fetchFn2).rate('2025-01-10', 'USD')
    expect(rate.toNumber()).toBe(24.35)
    expect(fetchFn2).not.toHaveBeenCalled()
  })

  it('throws a readable error for a currency CNB does not list', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(cnbBody))
    await expect(new CnbFxClient(db, fetchFn).rate('2025-01-10', 'XYZ')).rejects.toMatchObject({
      code: 'FX_RATE_NOT_FOUND',
    })
  })

  it('an empty table is a distinct code from an unquoted currency', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ rates: [] }))
    await expect(new CnbFxClient(db, fetchFn).rate('2025-01-11', 'USD')).rejects.toMatchObject({
      code: 'FX_TABLE_EMPTY',
    })
  })

  it('rejects a malformed date before touching the network', async () => {
    const fetchFn = vi.fn()
    await expect(new CnbFxClient(db, fetchFn).rate('10. 1. 2025', 'USD')).rejects.toMatchObject({
      code: 'FX_BAD_DATE',
    })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('GBX is GBP divided by a hundred', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ rates: [{ validFor: '2025-01-10', amount: 1, currencyCode: 'GBP', rate: 30 }] }),
      )
    const rate = await new CnbFxClient(db, fetchFn).rate('2025-01-10', 'GBX')
    expect(rate.toNumber()).toBeCloseTo(0.3, 6)
  })

  it('throws on an unexpected payload shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ rates: [{ nope: true }] }))
    await expect(new CnbFxClient(db, fetchFn).rate('2025-01-10', 'USD')).rejects.toMatchObject({
      code: 'FX_BAD_PAYLOAD',
    })
  })

  it('cachedRates reads a whole set of days in one go and derives GBX from GBP', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ rates: [{ validFor: '2025-01-10', amount: 1, currencyCode: 'GBP', rate: 30 }] }),
      )
    const client = new CnbFxClient(db, fetchFn)
    await client.rate('2025-01-10', 'GBP')

    const cached = await client.cachedRates(['2025-01-10', '2025-01-11'])
    expect(cached.get('2025-01-10|GBP')!.toNumber()).toBe(30)
    expect(cached.get('2025-01-10|GBX')!.toNumber()).toBeCloseTo(0.3, 6)
    expect(cached.has('2025-01-11|GBP')).toBe(false)
  })

  it('cachedRates asks nothing when there are no days', async () => {
    const fetchFn = vi.fn()
    expect((await new CnbFxClient(db, fetchFn).cachedRates([])).size).toBe(0)
  })

  it('throws on non-OK CNB response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('down', { status: 503 }))
    await expect(new CnbFxClient(db, fetchFn).rate('2025-01-10', 'USD')).rejects.toMatchObject({
      code: 'FX_HTTP_503',
    })
  })
})
