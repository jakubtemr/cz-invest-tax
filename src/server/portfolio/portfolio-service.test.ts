import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetDb } from '../db/testing.js'
import { ManualService } from '../manual/manual-service.js'
import { PortfolioService } from './portfolio-service.js'

const db = createTestDb()

beforeEach(async () => {
  resetDb(db)
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
