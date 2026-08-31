import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import * as schema from '../db/schema.js'
import type { T212DividendItem, T212HistoricalOrder, T212Position, T212TransactionItem } from '../t212/schemas.js'
import { SyncService, type T212Api } from './sync-service.js'

const db = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://invest:invest@localhost:5459/invest_test')

const aapl = { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD' }

const summary = {
  cash: { availableToTrade: 500, inPies: 0, reservedForOrders: 0 },
  currency: 'CZK',
  id: 99001122,
  investments: { currentValue: 17000, realizedProfitLoss: 512.3, totalCost: 12000, unrealizedProfitLoss: 5000 },
  totalValue: 17500,
}

const apiPosition: T212Position = {
  averagePricePaid: 150.5,
  createdAt: '2025-01-10T10:00:00Z',
  currentPrice: 210.25,
  instrument: aapl,
  quantity: 3.5,
  walletImpact: { currency: 'CZK', currentValue: 17000, fxImpact: -120, totalCost: 12000, unrealizedProfitLoss: 5000 },
}

function tradeOrder(id: number, side: 'BUY' | 'SELL'): T212HistoricalOrder {
  return {
    order: {
      id,
      side,
      status: 'FILLED',
      currency: 'CZK',
      instrument: aapl,
      ticker: aapl.ticker,
      createdAt: '2025-01-10T10:00:00Z',
    },
    fill: {
      filledAt: '2025-01-10T10:00:05Z',
      id: id * 10,
      price: 150.5,
      quantity: side === 'SELL' ? -1 : 2,
      type: 'TRADE',
      walletImpact: { currency: 'CZK', realisedProfitLoss: side === 'SELL' ? 512.3 : 0 },
    },
  }
}

const dividend: T212DividendItem = {
  amount: 25.3,
  currency: 'CZK',
  grossAmountPerShare: 0.26,
  instrument: aapl,
  paidOn: '2025-02-15T00:00:00Z',
  quantity: 100,
  reference: 'div-abc',
  ticker: aapl.ticker,
  type: 'ORDINARY',
}

const deposit: T212TransactionItem = {
  amount: 10000,
  currency: 'CZK',
  dateTime: '2025-03-01T08:00:00Z',
  reference: 'tx-1',
  type: 'DEPOSIT',
}

function fakeApi(pages: {
  orders?: T212HistoricalOrder[][]
  dividends?: T212DividendItem[][]
  transactions?: T212TransactionItem[][]
}) {
  const fetched = { orders: 0, dividends: 0, transactions: 0 }
  function generatorOf<T>(all: T[][], counter: keyof typeof fetched) {
    return async function* () {
      for (const page of all) {
        fetched[counter] += 1
        yield page
      }
    }
  }
  const api: T212Api = {
    getAccountSummary: async () => summary,
    getPositions: async () => [apiPosition],
    orderPages: generatorOf(pages.orders ?? [], 'orders'),
    dividendPages: generatorOf(pages.dividends ?? [], 'dividends'),
    transactionPages: generatorOf(pages.transactions ?? [], 'transactions'),
  }
  return { api, fetched }
}

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE accounts, instruments, positions, lots, sales, dividends, cash_transactions, snapshots RESTART IDENTITY CASCADE`,
  )
})

afterAll(async () => {
  await db.$client.end()
})

describe('SyncService.syncT212', () => {
  it('imports summary, positions and full history into an empty database', async () => {
    const { api } = fakeApi({
      orders: [[tradeOrder(1, 'BUY')], [tradeOrder(2, 'SELL')]],
      dividends: [[dividend]],
      transactions: [[deposit]],
    })

    const result = await new SyncService(db, api).syncT212()

    expect(result).toMatchObject({
      positions: 1,
      lotsAdded: 1,
      salesAdded: 1,
      dividendsAdded: 1,
      transactionsAdded: 1,
    })

    const account = (await db.select().from(schema.accounts))[0]!
    expect(account.broker).toBe('T212')
    expect(account.externalId).toBe('99001122')
    expect(account.currency).toBe('CZK')

    const positionRows = await db.select().from(schema.positions)
    expect(positionRows).toHaveLength(1)
    expect(positionRows[0]!.quantity).toBe('3.5')
    expect(positionRows[0]!.currentValue).toBe('17000')

    const lotRows = await db.select().from(schema.lots)
    expect(lotRows).toHaveLength(1)
    expect(lotRows[0]!.pricePerShare).toBe('150.5')

    const saleRows = await db.select().from(schema.sales)
    expect(saleRows).toHaveLength(1)
    expect(saleRows[0]!.realizedPnl).toBe('512.3')

    expect(await db.select().from(schema.dividends)).toHaveLength(1)
    expect(await db.select().from(schema.cashTransactions)).toHaveLength(1)

    const snapshotRows = await db.select().from(schema.snapshots)
    expect(snapshotRows).toHaveLength(1)
    expect(snapshotRows[0]!.totalValue).toBe('17500')
  })

  it('is idempotent — a second sync of the same data adds nothing and keeps one position row', async () => {
    const pages = {
      orders: [[tradeOrder(1, 'BUY')]],
      dividends: [[dividend]],
      transactions: [[deposit]],
    }
    await new SyncService(db, fakeApi(pages).api).syncT212()
    const second = await new SyncService(db, fakeApi(pages).api).syncT212()

    expect(second).toMatchObject({ lotsAdded: 0, salesAdded: 0, dividendsAdded: 0, transactionsAdded: 0 })
    expect(await db.select().from(schema.positions)).toHaveLength(1)
    expect(await db.select().from(schema.lots)).toHaveLength(1)
    // a snapshot is added on every sync
    expect(await db.select().from(schema.snapshots)).toHaveLength(2)
  })

  it('stops paginating history once a whole page is already known', async () => {
    await new SyncService(db, fakeApi({ orders: [[tradeOrder(1, 'BUY')]] }).api).syncT212()

    // a new record on page 1, page 2 is already imported, page 3 must never be fetched
    const { api, fetched } = fakeApi({
      orders: [[tradeOrder(5, 'BUY')], [tradeOrder(1, 'BUY')], [tradeOrder(9, 'BUY')]],
    })
    const result = await new SyncService(db, api).syncT212()

    expect(result.lotsAdded).toBe(1)
    expect(fetched.orders).toBe(2)
  })

  it('after an interrupted first import the next sync paginates the full history (no silent hole)', async () => {
    // the first run fails on page 2, so the history is incomplete and the flag must stay unset
    const failing = fakeApi({ orders: [[tradeOrder(1, 'BUY')]] })
    const originalPages = failing.api.orderPages.bind(failing.api)
    failing.api.orderPages = async function* () {
      yield* originalPages()
      throw new Error('network died')
    }
    await expect(new SyncService(db, failing.api).syncT212()).rejects.toThrow('network died')
    expect(await db.select().from(schema.snapshots)).toHaveLength(0)

    // second run: page 1 is known, page 2 is what the first run missed - it MUST be fetched
    const { api, fetched } = fakeApi({ orders: [[tradeOrder(1, 'BUY')], [tradeOrder(2, 'BUY')]] })
    const result = await new SyncService(db, api).syncT212()

    expect(fetched.orders).toBe(2)
    expect(result.lotsAdded).toBe(1)
    expect(await db.select().from(schema.lots)).toHaveLength(2)

    // third run: the history is complete, so the incremental stop fires on the first known page
    const third = fakeApi({ orders: [[tradeOrder(2, 'BUY')], [tradeOrder(1, 'BUY')]] })
    await new SyncService(db, third.api).syncT212()
    expect(third.fetched.orders).toBe(1)
  })

  it('does not stop on a page of skipped (non-mappable) orders', async () => {
    const cancelled: T212HistoricalOrder = { order: { id: 7, status: 'CANCELLED' } }
    const { api, fetched } = fakeApi({ orders: [[cancelled], [tradeOrder(1, 'BUY')]] })

    const result = await new SyncService(db, api).syncT212()

    expect(result.lotsAdded).toBe(1)
    expect(fetched.orders).toBe(2)
  })
})
