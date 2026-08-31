import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import { ManualService } from '../manual/manual-service.js'
import { PortfolioService } from './portfolio-service.js'

const db = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://invest:invest@localhost:5459/invest_test')

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE accounts, instruments, positions, lots, sales, dividends, cash_transactions, snapshots RESTART IDENTITY CASCADE`,
  )
})

afterAll(async () => {
  await db.$client.end()
})

describe('PortfolioService.overview', () => {
  it('returns accounts with joined positions and manual lots', async () => {
    const manual = new ManualService(db)
    await manual.addLot({
      ticker: 'INTC.US',
      name: 'Intel',
      currency: 'USD',
      quantity: '10',
      pricePerShare: '30',
      acquiredAt: new Date('2024-06-01'),
    })

    const overview = await new PortfolioService(db).overview()

    expect(overview.accounts).toHaveLength(1)
    const account = overview.accounts[0]!
    expect(account.broker).toBe('F24')
    expect(account.positions).toHaveLength(1)
    expect(account.positions[0]!.ticker).toBe('INTC.US')
    expect(account.positions[0]!.name).toBe('Intel')
    expect(account.snapshot).toBeNull()
    expect(overview.manualLots).toHaveLength(1)
    expect(overview.manualLots[0]!.ticker).toBe('INTC.US')
  })
})
