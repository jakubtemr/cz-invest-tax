import type { z } from 'zod'
import { AppError } from '../errors.js'
import {
  paginatedSchema,
  t212AccountSummarySchema,
  t212DividendItemSchema,
  t212HistoricalOrderSchema,
  t212PositionSchema,
  t212TransactionItemSchema,
} from './schemas.js'

const API_PREFIX = '/api/v0'
// The history/* endpoints allow 6 req/min; 11 s leaves headroom and the limit is shared across them.
const HISTORY_THROTTLE_MS = 11_000
const MAX_RATE_LIMIT_WAIT_MS = 65_000
const MAX_PAGE_LIMIT = 50
const MAX_HISTORY_PAGES = 1000
const FETCH_TIMEOUT_MS = 30_000

export interface T212ClientOptions {
  apiKey: string
  apiSecret: string
  baseUrl: string
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class T212Client {
  private readonly authHeader: string
  private readonly baseUrl: string
  private readonly origin: string
  private readonly fetchFn: typeof fetch
  private readonly sleepFn: (ms: number) => Promise<void>
  private lastHistoryRequestAt = 0

  constructor(options: T212ClientOptions) {
    this.authHeader = `Basic ${Buffer.from(`${options.apiKey}:${options.apiSecret}`).toString('base64')}`
    this.baseUrl = options.baseUrl
    this.origin = new URL(options.baseUrl).origin
    this.fetchFn = options.fetchFn ?? fetch
    this.sleepFn = options.sleepFn ?? defaultSleep
  }

  async getAccountSummary() {
    return this.request(`${API_PREFIX}/equity/account/summary`, t212AccountSummarySchema)
  }

  async getPositions() {
    return this.request(`${API_PREFIX}/equity/positions`, t212PositionSchema.array())
  }

  orderPages() {
    return this.paginate(`${API_PREFIX}/equity/history/orders?limit=${MAX_PAGE_LIMIT}`, t212HistoricalOrderSchema)
  }

  dividendPages() {
    return this.paginate(`${API_PREFIX}/equity/history/dividends?limit=${MAX_PAGE_LIMIT}`, t212DividendItemSchema)
  }

  transactionPages() {
    return this.paginate(`${API_PREFIX}/equity/history/transactions?limit=${MAX_PAGE_LIMIT}`, t212TransactionItemSchema)
  }

  private async *paginate<T extends z.ZodType>(initialPath: string, itemSchema: T): AsyncGenerator<z.output<T>[]> {
    const pageSchema = paginatedSchema(itemSchema)
    let path: string | null | undefined = initialPath
    let pages = 0
    while (path) {
      if (pages >= MAX_HISTORY_PAGES) {
        throw new AppError(`T212 pagination exceeded ${MAX_HISTORY_PAGES} pages`, 'T212_TOO_MANY_PAGES')
      }
      await this.throttleHistory()
      const page: { items: z.output<T>[]; nextPagePath?: string | null } = await this.request(path, pageSchema)
      pages += 1
      yield page.items
      path = page.nextPagePath ? this.resolveNextPath(path, page.nextPagePath) : null
    }
  }

  // On some endpoints (transactions) T212 returns nextPagePath as a bare query string with no path,
  // contradicting its own documentation. The current endpoint's path is filled back in.
  private resolveNextPath(currentPath: string, next: string): string {
    if (next.startsWith('/')) return next
    const basePath = currentPath.split('?')[0]!
    return `${basePath}?${next}`
  }

  // 6 req/min shared across history/* - the timer lives on the instance, not on the generator
  private async throttleHistory(): Promise<void> {
    const wait = this.lastHistoryRequestAt + HISTORY_THROTTLE_MS - Date.now()
    if (wait > 0) await this.sleepFn(wait)
    this.lastHistoryRequestAt = Date.now()
  }

  private async request<T extends z.ZodType>(path: string, schema: T, retried = false): Promise<z.output<T>> {
    // nextPagePath comes from the API response, so it is pinned to the expected origin - the auth
    // header must never be redirected somewhere else.
    const url = new URL(path, this.baseUrl)
    if (url.origin !== this.origin) {
      throw new AppError(`T212 returned off-origin page path: ${path}`, 'T212_BAD_PAGE_PATH')
    }
    const response = await this.fetchFn(url.toString(), {
      headers: { Authorization: this.authHeader },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (response.status === 429 && !retried) {
      await this.sleepFn(this.rateLimitWaitMs(response))
      return this.request(path, schema, true)
    }
    if (!response.ok) {
      throw new AppError(`T212 ${path} responded ${response.status}`, `T212_HTTP_${response.status}`)
    }

    const body: unknown = await response.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      throw new AppError(`T212 ${path} returned unexpected payload`, 'T212_BAD_PAYLOAD', { cause: parsed.error })
    }
    return parsed.data
  }

  private rateLimitWaitMs(response: Response): number {
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    if (!Number.isFinite(reset) || reset <= 0) return HISTORY_THROTTLE_MS
    // The header may carry epoch seconds or delta seconds - magnitude tells them apart.
    const waitMs = reset > 1e6 ? reset * 1000 - Date.now() : reset * 1000
    return Math.min(Math.max(waitMs, 1000), MAX_RATE_LIMIT_WAIT_MS)
  }
}
