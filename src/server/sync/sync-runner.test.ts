import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, resetDb } from '../db/testing.js'
import type { T212DividendItem, T212HistoricalOrder, T212Position, T212TransactionItem } from '../t212/schemas.js'
import { SyncRunner } from './sync-runner.js'
import type { T212Api } from './sync-service.js'

const db = createTestDb()

const aapl = { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD' }

const summary = {
  cash: { availableToTrade: 500, inPies: 0, reservedForOrders: 0 },
  currency: 'CZK',
  id: 99001122,
  investments: { currentValue: 17000, realizedProfitLoss: 512.3, totalCost: 12000, unrealizedProfitLoss: 5000 },
  totalValue: 17500,
}

const position: T212Position = {
  averagePricePaid: 150.5,
  instrument: aapl,
  quantity: 3.5,
  walletImpact: { currency: 'CZK', currentValue: 17000, totalCost: 12000, unrealizedProfitLoss: 5000 },
}

const order: T212HistoricalOrder = {
  order: { id: 1, side: 'BUY', status: 'FILLED', currency: 'CZK', instrument: aapl, ticker: aapl.ticker },
  fill: { filledAt: '2025-01-10T10:00:05Z', id: 10, price: 150.5, quantity: 2, type: 'TRADE' },
}

function slowApi() {
  let summaryCalls = 0
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const api: T212Api = {
    getAccountSummary: async () => {
      summaryCalls += 1
      await sleep(30)
      return summary
    },
    getPositions: async () => [position],
    orderPages: async function* () {
      await sleep(10)
      yield [order]
    },
    dividendPages: async function* (): AsyncGenerator<T212DividendItem[]> {},
    transactionPages: async function* (): AsyncGenerator<T212TransactionItem[]> {},
  }
  return { api, summaryCalls: () => summaryCalls }
}

beforeEach(async () => {
  resetDb(db)
})

async function waitUntilDone(runner: SyncRunner): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (!runner.status().running) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('the sync did not finish within 2 s')
}

describe('SyncRunner', () => {
  it('start returns immediately with running status, then status shows the finished result', async () => {
    const { api } = slowApi()
    const runner = new SyncRunner(db, api, vi.fn())

    const started = runner.start()
    expect(started.running).toBe(true)
    expect(started.startedAt).not.toBeNull()

    await waitUntilDone(runner)
    const done = runner.status()
    expect(done).toMatchObject({ running: false, positions: 1, lotsAdded: 1, error: null })
    expect(done.finishedAt).not.toBeNull()
    expect(done.pagesFetched).toBeGreaterThan(0)
  })

  it('second start while running does not spawn a second sync', async () => {
    const { api, summaryCalls } = slowApi()
    const runner = new SyncRunner(db, api, vi.fn())

    runner.start()
    runner.start()
    await waitUntilDone(runner)

    expect(summaryCalls()).toBe(1)
  })

  it('a failing sync ends with error in status, not an unhandled rejection', async () => {
    const { api } = slowApi()
    api.getPositions = async () => {
      throw new Error('boom')
    }
    const runner = new SyncRunner(db, api, vi.fn())

    runner.start()
    await waitUntilDone(runner)

    expect(runner.status()).toMatchObject({ running: false, error: expect.stringContaining('boom') })
  })
})
