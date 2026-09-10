import { serve } from '@hono/node-server'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'
import { BenchmarkService } from './benchmark/benchmark-service.js'
import { YahooChartClient } from './benchmark/yahoo-client.js'
import { createDb } from './db/client.js'
import { loadEnv } from './env.js'
import { CnbFxClient } from './fx/cnb-client.js'
import { ManualService } from './manual/manual-service.js'
import { PortfolioService } from './portfolio/portfolio-service.js'
import { createRouter } from './router.js'
import { SyncRunner } from './sync/sync-runner.js'
import { T212Client } from './t212/client.js'
import { TaxService } from './tax/tax-service.js'

const env = loadEnv()
const db = createDb(env.DATABASE_FILE)

const t212Configured = Boolean(env.T212_API_KEY && env.T212_API_SECRET)
const syncRunner = t212Configured
  ? new SyncRunner(
      db,
      new T212Client({ apiKey: env.T212_API_KEY!, apiSecret: env.T212_API_SECRET!, baseUrl: env.T212_API_BASE }),
    )
  : null

const fx = new CnbFxClient(db)
const router = createRouter({
  portfolio: new PortfolioService(db),
  benchmark: new BenchmarkService(db, new YahooChartClient(), fx),
  manual: new ManualService(db),
  sync: syncRunner,
  tax: new TaxService(db, fx),
})

const rpcHandler = new RPCHandler(router)
const app = new Hono()

// Defence against cross-site requests from other pages in the browser (the server has no auth).
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5178',
  'http://127.0.0.1:5178',
  `http://localhost:${env.PORT}`,
  `http://127.0.0.1:${env.PORT}`,
])

// Only guards requests carrying Content-Length; a chunked body is caught by the .max() bounds in the Zod schemas.
const MAX_BODY_BYTES = 2 * 1024 * 1024

app.use('/rpc/*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) return c.text('forbidden origin', 403)
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) return c.text('payload too large', 413)
  const { matched, response } = await rpcHandler.handle(c.req.raw, { prefix: '/rpc' })
  if (matched) return c.newResponse(response.body, response)
  await next()
})

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: env.PORT }, () => {
  console.log(`server on http://127.0.0.1:${env.PORT} (T212 sync ${t212Configured ? 'enabled' : 'no key'})`)
})
