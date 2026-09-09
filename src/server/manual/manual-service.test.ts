import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { createTestDb, resetDb } from '../db/testing.js'
import { ManualService } from './manual-service.js'

const db = createTestDb()
const service = new ManualService(db)

beforeEach(async () => {
  resetDb(db)
})

describe('ManualService.addLot', () => {
  it('creates F24 account, instrument, lot and an aggregated position', async () => {
    await service.addLot({
      ticker: 'INTC.US',
      name: 'Intel',
      currency: 'USD',
      quantity: '10',
      pricePerShare: '30',
      acquiredAt: new Date('2024-06-01T00:00:00Z'),
    })

    const accounts = await db.select().from(schema.accounts)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.broker).toBe('F24')

    const positions = await db.select().from(schema.positions)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.quantity).toBe('10')
    expect(Number(positions[0]!.averagePrice)).toBe(30)
    expect(positions[0]!.totalCost).toBe('300')
    expect(positions[0]!.source).toBe('manual')
  })

  it('aggregates two lots into weighted average price', async () => {
    const base = { ticker: 'INTC.US', name: 'Intel', currency: 'USD', acquiredAt: new Date('2024-06-01') }
    await service.addLot({ ...base, quantity: '10', pricePerShare: '30' })
    await service.addLot({ ...base, quantity: '10', pricePerShare: '50' })

    const positions = await db.select().from(schema.positions)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.quantity).toBe('20')
    expect(Number(positions[0]!.averagePrice)).toBe(40)
    expect(positions[0]!.totalCost).toBe('800')
    expect(await db.select().from(schema.lots)).toHaveLength(2)
  })

  it('setPrice fills current price, value and unrealized P/L', async () => {
    const { instrumentId } = await service.addLot({
      ticker: 'INTC.US',
      name: 'Intel',
      currency: 'USD',
      quantity: '10',
      pricePerShare: '30',
      acquiredAt: new Date('2024-06-01'),
    })

    await service.setPrice(instrumentId, '35')

    const position = (await db.select().from(schema.positions))[0]!
    expect(position.currentPrice).toBe('35')
    expect(Number(position.currentValue)).toBe(350)
    expect(Number(position.unrealizedPnl)).toBe(50)
  })

  it('transferRemainder moves the FIFO leftover to a new ticker keeping acquiredAt and price', async () => {
    // ticker-change scenario: two lots, a sale eats the first and part of the second, the rest moves
    const [account] = await db.insert(schema.accounts).values({ broker: 'T212', currency: 'CZK' }).returning()
    const [hon] = await db
      .insert(schema.instruments)
      .values({ ticker: 'HON_T', name: 'Honeywell', currency: 'USD' })
      .returning()
    await db.insert(schema.lots).values([
      {
        accountId: account!.id,
        instrumentId: hon!.id,
        quantity: '0.06',
        pricePerShare: '230',
        currency: 'USD',
        acquiredAt: new Date('2026-02-04T00:00:00Z'),
        reference: 'hon-lot-1',
        source: 'sync',
      },
      {
        accountId: account!.id,
        instrumentId: hon!.id,
        quantity: '0.05',
        pricePerShare: '220',
        currency: 'USD',
        acquiredAt: new Date('2026-05-14T00:00:00Z'),
        reference: 'hon-lot-2',
        source: 'sync',
      },
    ])
    await db.insert(schema.sales).values({
      accountId: account!.id,
      instrumentId: hon!.id,
      quantity: '0.07',
      pricePerShare: '240',
      currency: 'USD',
      soldAt: new Date('2026-07-06T00:00:00Z'),
      reference: 'hon-sale',
      source: 'sync',
    })

    const result = await service.transferRemainder({ fromTicker: 'HON_T', toTicker: 'HONAV_T' })
    expect(result.moved).toBe('0.04')

    // source: lot 1 drained by the sale, the transfer takes it to zero
    const honLots = await db.select().from(schema.lots).where(sql`instrument_id = ${hon!.id}`)
    const honSum = honLots.reduce((s, l) => s + Number(l.quantity), 0)
    expect(honSum).toBeCloseTo(0.07, 10)

    // target: a lot with the acquisition date and price of the original lot 2 PRESERVED
    const [honav] = await db.select().from(schema.instruments).where(sql`ticker = 'HONAV_T'`)
    const honavLots = await db.select().from(schema.lots).where(sql`instrument_id = ${honav!.id}`)
    expect(honavLots).toHaveLength(1)
    expect(honavLots[0]!.quantity).toBe('0.04')
    expect(honavLots[0]!.pricePerShare).toBe('220')
    expect(honavLots[0]!.acquiredAt).toEqual(new Date('2026-05-14T00:00:00Z'))
    expect(honavLots[0]!.source).toBe('manual')
  })

  it('transferRemainder rejects amounts above the available leftover', async () => {
    await service.addLot({
      ticker: 'X_T',
      name: null,
      currency: 'USD',
      quantity: '1',
      pricePerShare: '10',
      acquiredAt: new Date('2026-01-01'),
    })
    await expect(
      service.transferRemainder({ fromTicker: 'X_T', toTicker: 'Y_T', quantity: '2' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_REMAINDER' })
  })

  it('addLot with broker T212 requires the synced account and does not touch positions', async () => {
    await expect(
      service.addLot({
        ticker: 'MAIN_T',
        name: null,
        currency: 'EUR',
        quantity: '0.001',
        pricePerShare: '45',
        acquiredAt: new Date('2026-06-01'),
        broker: 'T212',
      }),
    ).rejects.toMatchObject({ code: 'T212_ACCOUNT_NOT_FOUND' })

    await db.insert(schema.accounts).values({ broker: 'T212', currency: 'CZK' })
    await service.addLot({
      ticker: 'MAIN_T',
      name: null,
      currency: 'EUR',
      quantity: '0.001',
      pricePerShare: '45',
      acquiredAt: new Date('2026-06-01'),
      broker: 'T212',
    })
    expect(await db.select().from(schema.lots)).toHaveLength(1)
    // T212 positions belong to the sync - a manual lot creates none
    expect(await db.select().from(schema.positions)).toHaveLength(0)
  })

  it('removeLot recomputes the position and deletes it when no lots remain', async () => {
    const first = await service.addLot({
      ticker: 'INTC.US',
      name: 'Intel',
      currency: 'USD',
      quantity: '10',
      pricePerShare: '30',
      acquiredAt: new Date('2024-06-01'),
    })

    await service.removeLot(first.lotId)

    expect(await db.select().from(schema.lots)).toHaveLength(0)
    expect(await db.select().from(schema.positions)).toHaveLength(0)
  })
})
