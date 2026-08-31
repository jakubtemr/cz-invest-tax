import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors.js'
import { T212Client } from './client.js'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

const summary = {
  cash: { availableToTrade: 100, inPies: 0, reservedForOrders: 0 },
  currency: 'CZK',
  id: 12345,
  investments: { currentValue: 900, realizedProfitLoss: 10, totalCost: 800, unrealizedProfitLoss: 100 },
  totalValue: 1000,
}

function createClient(fetchFn: typeof fetch, sleepFn = vi.fn().mockResolvedValue(undefined)) {
  return new T212Client({
    apiKey: 'key',
    apiSecret: 'secret',
    baseUrl: 'https://live.trading212.com',
    fetchFn,
    sleepFn,
  })
}

describe('T212Client', () => {
  it('sends Basic auth built from key:secret', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(summary))
    await createClient(fetchFn).getAccountSummary()

    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://live.trading212.com/api/v0/equity/account/summary')
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`)
  })

  it('throws AppError with status code on non-OK response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }))
    await expect(createClient(fetchFn).getAccountSummary()).rejects.toThrow(AppError)
    await expect(createClient(fetchFn).getAccountSummary()).rejects.toMatchObject({ code: 'T212_HTTP_403' })
  })

  it('rejects a payload that does not match the schema', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ totally: 'wrong' }))
    await expect(createClient(fetchFn).getAccountSummary()).rejects.toMatchObject({ code: 'T212_BAD_PAYLOAD' })
  })

  it('retries once after 429 using x-ratelimit-reset', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 2
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('limited', { status: 429, headers: { 'x-ratelimit-reset': String(resetAt) } }),
      )
      .mockResolvedValueOnce(jsonResponse(summary))
    const sleepFn = vi.fn().mockResolvedValue(undefined)

    const result = await createClient(fetchFn, sleepFn).getAccountSummary()

    expect(result.totalValue).toBe(1000)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledTimes(1)
  })

  it('refuses a nextPagePath that resolves off the API origin (credential exfiltration guard)', async () => {
    const page1 = {
      items: [{ amount: 1, currency: 'CZK', dateTime: '2025-01-01T00:00:00Z', reference: 'a', type: 'DEPOSIT' }],
      // a protocol-relative URL resolves to a foreign host; '@evil.com/x' is neutralised by new URL itself
      nextPagePath: '//evil.com/steal',
    }
    const fetchFn = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(page1)))
    const pages = createClient(fetchFn).transactionPages()

    await expect(async () => {
      for await (const _page of pages) {
        // the first page goes through, the second must fail the origin check
      }
    }).rejects.toMatchObject({ code: 'T212_BAD_PAGE_PATH' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('a bare query-string nextPagePath (T212 transactions quirk) resolves against the endpoint path', async () => {
    const page1 = {
      items: [{ amount: 1, currency: 'CZK', dateTime: '2025-01-01T00:00:00Z', reference: 'a', type: 'DEPOSIT' }],
      nextPagePath: 'limit=50&cursor=abc&time=2026-06-18T04:18:11.034Z',
    }
    const page2 = { items: [], nextPagePath: null }
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2))

    for await (const _page of createClient(fetchFn).transactionPages()) {
      // just drain the pages
    }

    expect(fetchFn.mock.calls[1]![0]).toBe(
      'https://live.trading212.com/api/v0/equity/history/transactions?limit=50&cursor=abc&time=2026-06-18T04:18:11.034Z',
    )
  })

  it('paginates history pages via nextPagePath with throttle between pages', async () => {
    const page1 = {
      items: [{ amount: 1, currency: 'CZK', dateTime: '2025-01-01T00:00:00Z', reference: 'a', type: 'DEPOSIT' }],
      nextPagePath: '/api/v0/equity/history/transactions?cursor=abc&limit=50',
    }
    const page2 = {
      items: [{ amount: 2, currency: 'CZK', dateTime: '2025-01-02T00:00:00Z', reference: 'b', type: 'DEPOSIT' }],
      nextPagePath: null,
    }
    const fetchFn = vi.fn().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2))
    const sleepFn = vi.fn().mockResolvedValue(undefined)

    const pages = []
    for await (const page of createClient(fetchFn, sleepFn).transactionPages()) {
      pages.push(page)
    }

    expect(pages.map((p) => p.map((i) => i.reference))).toEqual([['a'], ['b']])
    expect(fetchFn.mock.calls[1]![0]).toBe(
      'https://live.trading212.com/api/v0/equity/history/transactions?cursor=abc&limit=50',
    )
    // throttle between pages (6 req/min), not after the last one
    expect(sleepFn).toHaveBeenCalledTimes(1)
  })
})
