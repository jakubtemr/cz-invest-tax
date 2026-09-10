import Decimal from 'decimal.js'
import { z } from 'zod'
import { AppError } from '../errors.js'

export interface IndexClose {
  readonly day: string
  readonly close: string
}

// The external price vendor sits behind this so the service can be tested against a fake.
export interface BenchmarkPriceSource {
  dailyCloses(fromDay: string, toDay: string): Promise<IndexClose[]>
}

// S&P 500 total return: dividends reinvested, no fund fee - the index itself, which is what
// "beating the index" means.
export const BENCHMARK_SYMBOL = '^SP500TR'
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const REQUEST_TIMEOUT_MS = 15_000
const CLOSE_PLACES = 4
const MS_PER_SECOND = 1000
const SECONDS_PER_DAY = 24 * 60 * 60
// Yahoo answers with a browser-less block otherwise.
const USER_AGENT = 'Mozilla/5.0'

const yahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ exchangeTimezoneName: z.string() }),
          timestamp: z.array(z.number().int()).optional(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()) })) }),
        }),
      )
      .nullable(),
    error: z.object({ code: z.string(), description: z.string() }).nullable(),
  }),
})

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
}

function unixSeconds(day: string): number {
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / MS_PER_SECOND)
}

export class YahooChartClient implements BenchmarkPriceSource {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async dailyCloses(fromDay: string, toDay: string): Promise<IndexClose[]> {
    const query = new URLSearchParams({
      period1: String(unixSeconds(fromDay)),
      // period2 is exclusive; one more day makes the end inclusive.
      period2: String(unixSeconds(toDay) + SECONDS_PER_DAY),
      interval: '1d',
    })
    const response = await this.fetchFn(`${YAHOO_CHART_BASE}/${encodeURIComponent(BENCHMARK_SYMBOL)}?${query}`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    })
    if (!response.ok) {
      throw new AppError(`Index prices: HTTP ${response.status}`, `BENCHMARK_HTTP_${response.status}`)
    }
    const parsed = yahooChartSchema.safeParse(await response.json())
    if (!parsed.success) {
      throw new AppError('Index prices: unexpected response shape', 'BENCHMARK_BAD_PAYLOAD', { cause: parsed.error })
    }
    const { result, error } = parsed.data.chart
    const series = result?.[0]
    if (!series) {
      throw new AppError(`Index prices: ${error?.description ?? 'empty result'}`, 'BENCHMARK_NO_RESULT')
    }
    const exchangeDay = dayFormatter(series.meta.exchangeTimezoneName)
    const closes = series.indicators.quote[0]?.close ?? []
    return (series.timestamp ?? []).flatMap((seconds, index) => {
      const close = closes[index]
      // A null close is a session Yahoo lists but has no price for (a holiday row) - skip it.
      if (close == null) return []
      return [
        { day: exchangeDay.format(new Date(seconds * MS_PER_SECOND)), close: new Decimal(close).toFixed(CLOSE_PLACES) },
      ]
    })
  }
}
