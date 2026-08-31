import Decimal from 'decimal.js'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/client.js'
import * as schema from '../db/schema.js'
import { AppError } from '../errors.js'
import type { CnbFxClient } from '../fx/cnb-client.js'
import { TaxService } from './tax-service.js'

const db = createDb(process.env.TEST_DATABASE_URL ?? 'postgres://invest:invest@localhost:5459/invest_test')

// fx stub instead of the CNB API: USD = 24, CZK = 1; everything else is "not quoted"
const STUB_RATES: Record<string, number> = { USD: 24, CZK: 1 }
const fxStub = {
  // Serves crowns straight from the bulk cache; every foreign currency falls through to rate(),
  // which is where the stubbed behaviour lives. Both paths therefore run in every test.
  cachedRates: async (days: readonly string[]) => new Map(days.map((day) => [`${day}|CZK`, new Decimal(1)])),
  rate: async (date: string, currency: string) => {
    // EUR simulates a CNB outage - an error other than "unquoted currency" must propagate
    if (currency === 'EUR') throw new AppError('CNB unavailable', 'FX_HTTP_503')
    // this one day has no rate table at all, which is not the same as an unquoted currency
    if (date === '2026-07-04') throw new AppError('empty table', 'FX_TABLE_EMPTY')
    const rate = STUB_RATES[currency]
    if (!rate) throw new AppError(`CNB does not quote ${currency}`, 'FX_RATE_NOT_FOUND')
    return new Decimal(rate)
  },
} as unknown as CnbFxClient

const service = (): TaxService => new TaxService(db, fxStub)
const codes = (overview: { warnings: readonly { code: string }[] }): string[] => overview.warnings.map((w) => w.code)

async function seed() {
  const [account] = await db.insert(schema.accounts).values({ broker: 'T212', currency: 'CZK' }).returning()
  const [aapl] = await db
    .insert(schema.instruments)
    .values({ ticker: 'AAPL_US_EQ', name: 'Apple', currency: 'USD', isin: 'US0378331005', country: 'US' })
    .returning()
  const accountId = account!.id
  const instrumentId = aapl!.id

  await db.insert(schema.lots).values([
    {
      accountId,
      instrumentId,
      quantity: '10',
      pricePerShare: '100',
      currency: 'USD',
      acquiredAt: new Date('2022-01-10T00:00:00Z'),
      reference: 'lot-1',
      source: 'sync',
    },
    {
      accountId,
      instrumentId,
      quantity: '5',
      pricePerShare: '200',
      currency: 'USD',
      acquiredAt: new Date('2026-02-01T00:00:00Z'),
      reference: 'lot-2',
      source: 'sync',
    },
  ])
  await db.insert(schema.sales).values({
    accountId,
    instrumentId,
    quantity: '6',
    pricePerShare: '300',
    currency: 'USD',
    soldAt: new Date('2026-03-01T00:00:00Z'),
    reference: 'sale-1',
    source: 'sync',
  })
  await db.insert(schema.dividends).values({
    accountId,
    instrumentId,
    amount: '204',
    currency: 'CZK',
    grossAmountPerShare: '1',
    quantity: '10',
    type: 'ORDINARY',
    paidOn: new Date('2026-02-15T00:00:00Z'),
    reference: 'div-1',
  })
  await db.insert(schema.cashTransactions).values({
    accountId,
    amount: '50',
    currency: 'CZK',
    type: 'INTEREST_ON_FREE_CASH',
    occurredAt: new Date('2026-01-05T00:00:00Z'),
    reference: 'int-1',
  })
  return { accountId, instrumentId }
}

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE accounts, instruments, positions, lots, sales, dividends, cash_transactions, snapshots, fx_rates RESTART IDENTITY CASCADE`,
  )
})

afterAll(async () => {
  await db.$client.end()
})

describe('TaxService.overview', () => {
  it('builds the year summary and open lots with the exemption countdown from DB data', async () => {
    const { accountId, instrumentId } = await seed()
    // the position agrees with the history (15 bought - 6 sold = 9), so nothing to reconcile
    await db
      .insert(schema.positions)
      .values({ accountId, instrumentId, quantity: '9', averagePrice: '100', source: 'sync' })

    const overview = await service().overview({ year: 2026 })
    expect(codes(overview)).toHaveLength(0)

    // 6 x 300 x 24 = 43 200 CZK, under the limit
    expect(overview.summary.totalSaleProceedsCzk).toBe('43200.00')
    expect(overview.summary.under100kExemption).toBe(true)
    expect(overview.summary.dividends.grossCzk).toBe('240.00')
    expect(overview.summary.interestCzk).toBe('50.00')

    // FIFO: 6 shares out of lot 1 (10 shares), leaving 4 plus all of lot 2
    expect(overview.openLots).toHaveLength(2)
    const lot1 = overview.openLots.find((lot) => lot.reference === 'lot-1')!
    expect(lot1.remainingQuantity).toBe('4')
    expect(lot1.exemptFrom).toEqual(new Date('2025-01-11T00:00:00Z'))
    expect(lot1.alreadyExempt).toBe(true)
    expect(overview.openLots.find((lot) => lot.reference === 'lot-2')!.alreadyExempt).toBe(false)

    expect(overview.availableYears).toContain(2026)
    expect(overview.supportedYears).toContain(2026)
  })

  it('computes the tax, the s. 8 and s. 10 bases and the withholding credit', async () => {
    await seed()
    const overview = await service().overview({ year: 2026 })
    // s. 8 = 240 gross dividends + 50 interest; s. 10 = 0, sales are exempt under the limit
    expect(overview.computation.section8BaseCzk).toBe('290.00')
    expect(overview.computation.section10BaseCzk).toBe('0.00')
    expect(overview.computation.roundedBaseCzk).toBe('200.00')
    expect(overview.computation.taxBeforeCreditCzk).toBe('30.00')
    // 36 CZK withheld in the US is creditable, capped by the tax attributable to US income
    expect(overview.computation.creditsByCountry[0]!.country).toBe('US')
    expect(Number(overview.computation.creditCzk)).toBeGreaterThan(0)
  })

  it('accepts other partial tax bases and lets them decide the top rate', async () => {
    await seed()
    const overview = await service().overview({ year: 2026, otherBasesCzk: '2000000' })
    expect(overview.computation.otherBasesCzk).toBe('2000000.00')
    expect(Number(overview.computation.topRateTaxCzk)).toBeGreaterThan(0)
  })

  it('lists every year that has data, newest first', async () => {
    const { accountId, instrumentId } = await seed()
    await db.insert(schema.sales).values({
      accountId,
      instrumentId,
      quantity: '1',
      pricePerShare: '100',
      currency: 'USD',
      soldAt: new Date('2024-05-01T00:00:00Z'),
      reference: 'sale-2024',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.availableYears).toEqual([...overview.availableYears].sort((a, b) => b - a))
    expect(overview.availableYears).toContain(2024)
    expect(overview.availableYears).toContain(2026)
  })

  it('rejects a year it has no constants for instead of guessing', async () => {
    await seed()
    await expect(service().overview({ year: 2019 })).rejects.toMatchObject({ code: 'TAX_YEAR_UNSUPPORTED' })
  })

  it('rescales lots to the broker quantity on a split and keeps the acquisition date', async () => {
    const { accountId, instrumentId } = await seed()
    // 2:1 split - the broker reports 18 where the history says 9
    await db
      .insert(schema.positions)
      .values({ accountId, instrumentId, quantity: '18', averagePrice: '50', source: 'sync' })

    const overview = await service().overview({ year: 2026 })
    const lot1 = overview.openLots.find((lot) => lot.reference === 'lot-1')!
    expect(lot1.remainingQuantity).toBe('8')
    expect(lot1.pricePerShare).toBe('50')
    expect(lot1.acquiredAt).toEqual(new Date('2022-01-10T00:00:00Z'))
    expect(lot1.exemptFrom).toEqual(new Date('2025-01-11T00:00:00Z'))
    expect(codes(overview)).toContain('reconcile.split')
  })

  it('closes a holding the broker no longer reports', async () => {
    const { accountId } = await seed()
    const [sold] = await db.insert(schema.instruments).values({ ticker: 'GONE_US_EQ', currency: 'USD' }).returning()
    await db.insert(schema.lots).values({
      accountId,
      instrumentId: sold!.id,
      quantity: '3',
      pricePerShare: '10',
      currency: 'USD',
      acquiredAt: new Date('2025-01-01T00:00:00Z'),
      reference: 'lot-gone',
      source: 'sync',
    })
    // a sync position exists for the other instrument, so this account IS broker-tracked
    await db.insert(schema.positions).values({
      accountId,
      instrumentId: 1,
      quantity: '9',
      averagePrice: '100',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.openLots.some((lot) => lot.instrumentKey === 'GONE_US_EQ')).toBe(false)
    expect(codes(overview)).toContain('reconcile.closed')
  })

  it('leaves lots alone on an account the broker does not report at all', async () => {
    await seed()
    const overview = await service().overview({ year: 2026 })
    expect(overview.openLots).toHaveLength(2)
    expect(codes(overview).filter((code) => code.startsWith('reconcile.'))).toHaveLength(0)
  })

  it('derives the source country from the ISIN when none was set by hand', async () => {
    const { accountId } = await seed()
    const [sap] = await db
      .insert(schema.instruments)
      .values({ ticker: 'SAP_DE_EQ', currency: 'USD', isin: 'DE0007164600' })
      .returning()
    await db.insert(schema.dividends).values({
      accountId,
      instrumentId: sap!.id,
      amount: '4.25',
      currency: 'USD',
      grossAmountPerShare: '0.5',
      quantity: '10',
      type: 'ORDINARY',
      paidOn: new Date('2026-04-01T00:00:00Z'),
      reference: 'div-sap',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.dividends.items.find((d) => d.instrumentKey === 'SAP_DE_EQ')!.country).toBe('DE')
    expect(overview.summary.dividends.byCountry.map((row) => row.country)).toEqual(['DE', 'US'])
  })

  it('falls back to UNKNOWN when the instrument has neither a country nor an ISIN', async () => {
    const { accountId } = await seed()
    const [mystery] = await db.insert(schema.instruments).values({ ticker: 'MYSTERY', currency: 'USD' }).returning()
    await db.insert(schema.dividends).values({
      accountId,
      instrumentId: mystery!.id,
      amount: '8',
      currency: 'USD',
      grossAmountPerShare: '1',
      quantity: '10',
      type: 'ORDINARY',
      paidOn: new Date('2026-04-01T00:00:00Z'),
      reference: 'div-mystery',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.dividends.items.find((d) => d.instrumentKey === 'MYSTERY')!.country).toBe('UNKNOWN')
    expect(codes(overview)).toContain('treatyUnknown')
  })

  it('a dividend on an instrument with unknown currency falls back to the net amount', async () => {
    const { accountId } = await seed()
    const [mystery] = await db.insert(schema.instruments).values({ ticker: 'NOCCY', currency: 'UNKNOWN' }).returning()
    await db.insert(schema.dividends).values({
      accountId,
      instrumentId: mystery!.id,
      amount: '100',
      currency: 'CZK',
      grossAmountPerShare: '2',
      quantity: '50',
      type: 'ORDINARY',
      paidOn: new Date('2026-04-01T00:00:00Z'),
      reference: 'div-noccy',
    })
    await db.insert(schema.lots).values({
      accountId,
      instrumentId: mystery!.id,
      quantity: '1',
      pricePerShare: '10',
      currency: 'USD',
      acquiredAt: new Date('2026-01-01T00:00:00Z'),
      reference: 'lot-noccy',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    const item = overview.summary.dividends.items.find((row) => row.instrumentKey === 'NOCCY')!
    expect(item.grossCzk).toBe('100.00')
    expect(item.withheldCzk).toBe('0.00')
    expect(codes(overview)).toContain('dividendGrossMissing')
    // an instrument with no name still yields an open lot, with a null name
    expect(overview.openLots.find((lot) => lot.instrumentKey === 'NOCCY')!.instrumentName).toBeNull()
  })

  it('a currency CNB does not quote degrades to a warning instead of failing the overview', async () => {
    const { accountId } = await seed()
    const [pln] = await db.insert(schema.instruments).values({ ticker: 'PKN_PL_EQ', currency: 'PLN' }).returning()
    await db.insert(schema.sales).values({
      accountId,
      instrumentId: pln!.id,
      quantity: '5',
      pricePerShare: '100',
      currency: 'PLN',
      soldAt: new Date('2026-05-01T10:00:00Z'),
      reference: 'sale-pln',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    expect(codes(overview)).toContain('fxCurrencyUnquoted')
    expect(codes(overview)).toContain('itemDroppedNoRate')
    expect(overview.summary.totalSaleProceedsCzk).toBe('43200.00')
  })

  it('a day with no rate table is reported as unavailable, not as an unquoted currency', async () => {
    const { accountId, instrumentId } = await seed()
    await db.insert(schema.sales).values({
      accountId,
      instrumentId,
      quantity: '1',
      pricePerShare: '100',
      currency: 'USD',
      soldAt: new Date('2026-07-04T10:00:00Z'),
      reference: 'sale-nofx',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    expect(codes(overview)).toContain('fxRateUnavailable')
    expect(codes(overview)).not.toContain('fxCurrencyUnquoted')
  })

  it('drops a sale whose LOT currency has no rate, not only the sale currency', async () => {
    const { accountId } = await seed()
    const [mixed] = await db.insert(schema.instruments).values({ ticker: 'MIX_US_EQ', currency: 'USD' }).returning()
    await db.insert(schema.lots).values({
      accountId,
      instrumentId: mixed!.id,
      quantity: '5',
      pricePerShare: '10',
      currency: 'PLN',
      acquiredAt: new Date('2025-01-01T00:00:00Z'),
      reference: 'lot-pln',
      source: 'sync',
    })
    await db.insert(schema.sales).values({
      accountId,
      instrumentId: mixed!.id,
      quantity: '5',
      pricePerShare: '20',
      currency: 'USD',
      soldAt: new Date('2026-05-01T10:00:00Z'),
      reference: 'sale-usd-pln-lot',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.sales.some((row) => row.instrumentKey === 'MIX_US_EQ')).toBe(false)
    expect(codes(overview)).toContain('itemDroppedNoRate')
  })

  it('drops a dividend paid in a currency with no rate and names the instrument', async () => {
    const { accountId } = await seed()
    const [pln] = await db.insert(schema.instruments).values({ ticker: 'PZU_PL_EQ', currency: 'PLN' }).returning()
    await db.insert(schema.dividends).values({
      accountId,
      instrumentId: pln!.id,
      amount: '40',
      currency: 'PLN',
      grossAmountPerShare: '5',
      quantity: '10',
      type: 'ORDINARY',
      paidOn: new Date('2026-04-01T00:00:00Z'),
      reference: 'div-pln',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.dividends.items.some((row) => row.instrumentKey === 'PZU_PL_EQ')).toBe(false)
    expect(overview.warnings.some((w) => w.code === 'itemDroppedNoRate' && w.params.instrument === 'PZU_PL_EQ')).toBe(
      true,
    )
  })

  it('drops an interest payment in a currency with no rate rather than failing', async () => {
    const { accountId } = await seed()
    await db.insert(schema.cashTransactions).values({
      accountId,
      amount: '500',
      currency: 'PLN',
      type: 'INTEREST_ON_FREE_CASH',
      occurredAt: new Date('2026-01-07T00:00:00Z'),
      reference: 'int-pln',
    })

    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.interestCzk).toBe('50.00')
    expect(codes(overview)).toContain('fxCurrencyUnquoted')
  })

  it('folds a broker fee into the cost of the matched part', async () => {
    const { accountId } = await seed()
    const [feeTicker] = await db.insert(schema.instruments).values({ ticker: 'FEE_US_EQ', currency: 'USD' }).returning()
    await db.insert(schema.lots).values({
      accountId,
      instrumentId: feeTicker!.id,
      quantity: '10',
      pricePerShare: '10',
      currency: 'USD',
      acquiredAt: new Date('2026-01-02T00:00:00Z'),
      fee: '24',
      feeCurrency: 'CZK',
      reference: 'lot-fee',
      source: 'sync',
    })
    await db.insert(schema.sales).values({
      accountId,
      instrumentId: feeTicker!.id,
      quantity: '10',
      pricePerShare: '20',
      currency: 'USD',
      soldAt: new Date('2026-06-01T00:00:00Z'),
      fee: '36',
      feeCurrency: 'CZK',
      reference: 'sale-fee',
      source: 'sync',
    })

    const overview = await service().overview({ year: 2026 })
    const row = overview.summary.sales.find((sale) => sale.instrumentKey === 'FEE_US_EQ')!
    expect(row.feeCzk).toBe('60.00')
    expect(row.costCzk).toBe('2460.00')
  })

  it('an FX outage (an error other than not-found) propagates instead of being swallowed', async () => {
    const { accountId } = await seed()
    const [eur] = await db.insert(schema.instruments).values({ ticker: 'SAP_DE', currency: 'EUR' }).returning()
    await db.insert(schema.sales).values({
      accountId,
      instrumentId: eur!.id,
      quantity: '1',
      pricePerShare: '100',
      currency: 'EUR',
      soldAt: new Date('2026-05-01T10:00:00Z'),
      reference: 'sale-eur',
      source: 'sync',
    })

    await expect(service().overview({ year: 2026 })).rejects.toMatchObject({ code: 'FX_HTTP_503' })
  })

  it('an empty database yields an empty, warning-free overview', async () => {
    const overview = await service().overview({ year: 2026 })
    expect(overview.summary.totalSaleProceedsCzk).toBe('0.00')
    expect(overview.openLots).toHaveLength(0)
    expect(overview.warnings).toHaveLength(0)
    expect(overview.computation.taxAfterCreditCzk).toBe('0.00')
  })
})
