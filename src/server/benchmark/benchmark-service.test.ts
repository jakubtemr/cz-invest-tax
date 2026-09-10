import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accounts,
  benchmarkPrices,
  cashTransactions,
  fxRates,
  instruments,
  positions,
  snapshots,
} from '../db/schema.js'
import { createTestDb, resetDb } from '../db/testing.js'
import { CnbFxClient } from '../fx/cnb-client.js'
import { BenchmarkService } from './benchmark-service.js'
import type { BenchmarkPriceSource, IndexClose } from './yahoo-client.js'

const db = createTestDb()

const closes: IndexClose[] = [
  { day: '2022-12-30', close: '95' },
  { day: '2023-01-03', close: '100' },
  { day: '2024-01-02', close: '120' },
]

function fakeSource(rows: IndexClose[] = closes) {
  const dailyCloses = vi.fn<BenchmarkPriceSource['dailyCloses']>().mockResolvedValue(rows)
  return { source: { dailyCloses } satisfies BenchmarkPriceSource, dailyCloses }
}

const at = (day: string) => new Date(`${day}T10:00:00Z`)

async function seedAccount(currency = 'CZK'): Promise<number> {
  const [row] = await db.insert(accounts).values({ broker: 'T212', currency }).returning({ id: accounts.id })
  return row!.id
}

async function seedFx(day: string, usd: string): Promise<void> {
  await db.insert(fxRates).values({ date: day, currency: 'USD', rate: usd, amount: 1 })
}

beforeEach(() => {
  resetDb(db)
})

describe('BenchmarkService', () => {
  it('reports that nothing can be compared before the first deposit', async () => {
    const { source } = fakeSource()
    const summary = await new BenchmarkService(db, source, new CnbFxClient(db, vi.fn())).summary()
    expect(summary).toEqual({ status: 'noFlows' })
  })

  it('needs a valuation before it can compare', async () => {
    const accountId = await seedAccount()
    await db.insert(cashTransactions).values({
      accountId,
      amount: '10000',
      currency: 'CZK',
      type: 'DEPOSIT',
      occurredAt: at('2023-01-02'),
      reference: 'd1',
    })
    const { source } = fakeSource()
    const summary = await new BenchmarkService(db, source, new CnbFxClient(db, vi.fn())).summary()
    expect(summary).toEqual({ status: 'noValuation' })
  })

  it('replays external flows only, on the last close on or before each day, into the index', async () => {
    const accountId = await seedAccount()
    await db.insert(cashTransactions).values([
      { accountId, amount: '10000', currency: 'CZK', type: 'DEPOSIT', occurredAt: at('2023-01-02'), reference: 'd1' },
      {
        accountId,
        amount: '3',
        currency: 'CZK',
        type: 'LENDING_INTEREST',
        occurredAt: at('2023-06-01'),
        reference: 'i1',
      },
      { accountId, amount: '-0.5', currency: 'USD', type: 'FEE', occurredAt: at('2023-06-02'), reference: 'f1' },
    ])
    await db.insert(snapshots).values({ accountId, currency: 'CZK', totalValue: '12000', takenAt: at('2024-01-02') })
    await seedFx('2023-01-02', '22.5')
    await seedFx('2024-01-02', '25')
    const { source, dailyCloses } = fakeSource()

    const service = new BenchmarkService(db, source, new CnbFxClient(db, vi.fn()))
    const summary = await service.summary()

    // 2023-01-02 has no session of its own, so the deposit buys at the 2022-12-30 close of 95
    expect(summary).toMatchObject({
      status: 'ready',
      since: '2023-01-02',
      asOf: '2024-01-02',
      netInvestedCzk: '10000.00',
      portfolioValueCzk: '12000.00',
      benchmarkValueCzk: '14035.09',
      differenceCzk: '-2035.09',
    })
    expect(dailyCloses).toHaveBeenCalledTimes(1)
    const [fromDay, toDay] = dailyCloses.mock.calls[0]!
    expect(fromDay < '2023-01-02').toBe(true)
    expect(toDay).toBe('2024-01-02')
    expect((await db.select().from(benchmarkPrices)).length).toBe(3)

    // Prices are now cached through the valuation day - the second summary does not go out.
    await service.summary()
    expect(dailyCloses).toHaveBeenCalledTimes(1)
  })

  it('overwrites a cached close - the vendor returns a running value during the session', async () => {
    const accountId = await seedAccount()
    await db.insert(cashTransactions).values({
      accountId,
      amount: '1000',
      currency: 'CZK',
      type: 'DEPOSIT',
      occurredAt: at('2023-01-03'),
      reference: 'd1',
    })
    await db.insert(snapshots).values({ accountId, currency: 'CZK', totalValue: '1000', takenAt: at('2024-01-02') })
    await db.insert(benchmarkPrices).values({ date: '2024-01-02', close: '110' })
    await seedFx('2023-01-03', '1')
    await seedFx('2024-01-02', '1')
    const { source } = fakeSource()

    const summary = await new BenchmarkService(db, source, new CnbFxClient(db, vi.fn())).summary()
    expect(summary).toMatchObject({ status: 'ready', benchmarkValueCzk: '1200.00' })
  })

  it('values a manual account from its positions when it has no snapshot', async () => {
    const t212 = await seedAccount()
    const [f24] = await db.insert(accounts).values({ broker: 'F24', currency: 'EUR' }).returning({ id: accounts.id })
    const [instrument] = await db
      .insert(instruments)
      .values({ ticker: 'X', currency: 'EUR' })
      .returning({ id: instruments.id })
    await db.insert(cashTransactions).values([
      {
        accountId: t212,
        amount: '1000',
        currency: 'CZK',
        type: 'DEPOSIT',
        occurredAt: at('2023-01-03'),
        reference: 'd1',
      },
      {
        accountId: f24!.id,
        amount: '40',
        currency: 'EUR',
        type: 'DEPOSIT',
        occurredAt: at('2023-01-03'),
        reference: 'd2',
      },
    ])
    await db
      .insert(snapshots)
      .values({ accountId: t212, currency: 'CZK', totalValue: '1100', takenAt: at('2024-01-02') })
    await db.insert(positions).values({
      accountId: f24!.id,
      instrumentId: instrument!.id,
      quantity: '1',
      averagePrice: '40',
      currentValue: '50',
      valueCurrency: 'EUR',
      source: 'manual',
    })
    await seedFx('2023-01-03', '1')
    await seedFx('2024-01-02', '1')
    await db.insert(fxRates).values([
      { date: '2023-01-03', currency: 'EUR', rate: '25', amount: 1 },
      { date: '2024-01-02', currency: 'EUR', rate: '24', amount: 1 },
    ])
    const { source } = fakeSource()

    const summary = await new BenchmarkService(db, source, new CnbFxClient(db, vi.fn())).summary()
    // 1000 + 40 * 25 invested; 1100 + 50 * 24 held
    expect(summary).toMatchObject({ status: 'ready', netInvestedCzk: '2000.00', portfolioValueCzk: '2300.00' })
  })
})
