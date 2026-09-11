import { describe, expect, it, vi } from 'vitest'
import { YahooChartClient } from './yahoo-client.js'

// Two sessions at 9:30 New York (13:30 UTC), one holiday row without a close.
const chartBody = {
  chart: {
    result: [
      {
        meta: { exchangeTimezoneName: 'America/New_York' },
        timestamp: [1645626600, 1645713000, 1645799400],
        indicators: { quote: [{ close: [8871.9501953125, null, 9207.849609375] }] },
      },
    ],
    error: null,
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('YahooChartClient', () => {
  it('maps timestamps to exchange days, rounds closes and skips empty sessions', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(chartBody))
    const closes = await new YahooChartClient(fetchFn).dailyCloses('2022-02-23', '2022-02-25')

    expect(closes).toEqual([
      { day: '2022-02-23', close: '8871.9502' },
      { day: '2022-02-25', close: '9207.8496' },
    ])
    const url = new URL(fetchFn.mock.calls[0]![0] as string)
    expect(url.pathname).toContain('%5ESP500TR')
    expect(url.searchParams.get('period1')).toBe('1645574400')
    expect(url.searchParams.get('period2')).toBe('1645833600')
  })

  it('surfaces the vendor error for an unknown symbol', async () => {
    const body = { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } }
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(body))
    await expect(new YahooChartClient(fetchFn).dailyCloses('2022-02-23', '2022-02-25')).rejects.toMatchObject({
      code: 'BENCHMARK_NO_RESULT',
      message: expect.stringContaining('No data found'),
    })
  })

  it('rejects an HTTP failure and an unexpected payload', async () => {
    await expect(
      new YahooChartClient(vi.fn().mockResolvedValue(jsonResponse({}, 503))).dailyCloses('2022-02-23', '2022-02-25'),
    ).rejects.toMatchObject({ code: 'BENCHMARK_HTTP_503' })
    await expect(
      new YahooChartClient(vi.fn().mockResolvedValue(jsonResponse({ nope: 1 }))).dailyCloses(
        '2022-02-23',
        '2022-02-25',
      ),
    ).rejects.toMatchObject({ code: 'BENCHMARK_BAD_PAYLOAD' })
  })
})
