import { describe, expect, it } from 'vitest'
import { mapDividend, mapOrder, mapPosition, mapTransaction, sumFees } from './mappers.js'
import type { T212DividendItem, T212HistoricalOrder, T212Position, T212TransactionItem } from './schemas.js'

const aapl = { ticker: 'AAPL_US_EQ', name: 'Apple', isin: 'US0378331005', currency: 'USD' }

const position: T212Position = {
  averagePricePaid: 150.5,
  createdAt: '2025-01-10T10:00:00Z',
  currentPrice: 210.25,
  instrument: aapl,
  quantity: 3.5,
  quantityAvailableForTrading: 3.5,
  quantityInPies: 0,
  walletImpact: {
    currency: 'CZK',
    currentValue: 17000.1,
    fxImpact: -120.5,
    totalCost: 12000,
    unrealizedProfitLoss: 5000.1,
  },
}

const buyOrder: T212HistoricalOrder = {
  order: {
    createdAt: '2025-01-10T10:00:00Z',
    currency: 'CZK',
    id: 111,
    instrument: aapl,
    quantity: 2,
    side: 'BUY',
    status: 'FILLED',
    ticker: 'AAPL_US_EQ',
    type: 'MARKET',
  },
  fill: {
    filledAt: '2025-01-10T10:00:05Z',
    id: 222,
    price: 150.5,
    quantity: 2,
    type: 'TRADE',
    walletImpact: { currency: 'CZK', fxRate: 23.5, netValue: -7073.5, realisedProfitLoss: 0, taxes: [] },
  },
}

describe('mapPosition', () => {
  it('maps API position to a DB row with numbers as strings', () => {
    const row = mapPosition(position, 1, 2)
    expect(row).toEqual({
      accountId: 1,
      instrumentId: 2,
      quantity: '3.5',
      averagePrice: '150.5',
      currentPrice: '210.25',
      currentValue: '17000.1',
      totalCost: '12000',
      unrealizedPnl: '5000.1',
      fxImpact: '-120.5',
      valueCurrency: 'CZK',
      source: 'sync',
    })
  })

  it('handles missing walletImpact', () => {
    const row = mapPosition({ ...position, walletImpact: undefined }, 1, 2)
    expect(row.currentValue).toBeNull()
    expect(row.valueCurrency).toBeNull()
  })
})

describe('mapOrder', () => {
  it('maps a filled BUY trade to a lot in instrument currency', () => {
    const result = mapOrder(buyOrder, 1, 2)
    expect(result).toEqual({
      kind: 'lot',
      row: {
        accountId: 1,
        instrumentId: 2,
        quantity: '2',
        pricePerShare: '150.5',
        currency: 'USD',
        acquiredAt: new Date('2025-01-10T10:00:05Z'),
        fee: null,
        feeCurrency: null,
        reference: 't212-fill-222',
        source: 'sync',
        raw: buyOrder,
      },
    })
  })

  it('maps a filled SELL trade to a sale with positive quantity and realized P/L', () => {
    const sellOrder: T212HistoricalOrder = {
      order: { ...buyOrder.order!, id: 333, side: 'SELL', quantity: -2 },
      fill: { ...buyOrder.fill!, id: 444, quantity: -2, walletImpact: { currency: 'CZK', realisedProfitLoss: 512.3 } },
    }
    const result = mapOrder(sellOrder, 1, 2)
    expect(result.kind).toBe('sale')
    if (result.kind !== 'sale') throw new Error('unreachable')
    expect(result.row.quantity).toBe('2')
    expect(result.row.realizedPnl).toBe('512.3')
    expect(result.row.soldAt).toEqual(new Date('2025-01-10T10:00:05Z'))
    expect(result.row.reference).toBe('t212-fill-444')
  })

  it('skips STOCK_SPLIT fills - a split rescales existing lots, it is not an acquisition', () => {
    const split: T212HistoricalOrder = {
      order: buyOrder.order,
      fill: { ...buyOrder.fill!, type: 'STOCK_SPLIT' },
    }
    expect(mapOrder(split, 1, 2)).toEqual({ kind: 'skip', reason: 'fill-type-STOCK_SPLIT' })
  })

  it('maps a scrip dividend fill to a zero-cost lot with the fill date', () => {
    const scrip: T212HistoricalOrder = {
      order: { ...buyOrder.order!, side: undefined },
      fill: { ...buyOrder.fill!, id: 555, type: 'SCRIP_STOCK_DIVIDENDS', quantity: 0.00068103, price: 0 },
    }
    const result = mapOrder(scrip, 1, 2)
    if (result.kind !== 'lot') throw new Error('expected lot')
    expect(result.row.quantity).toBe('0.00068103')
    expect(result.row.pricePerShare).toBe('0')
    expect(result.row.reference).toBe('t212-fill-555')
  })

  it('skips orders without a fill (cancelled, pending)', () => {
    expect(mapOrder({ order: { ...buyOrder.order!, status: 'CANCELLED' } }, 1, 2)).toEqual({
      kind: 'skip',
      reason: 'no-fill',
    })
  })

  it('falls back to order currency when instrument is missing', () => {
    const noInstrument: T212HistoricalOrder = {
      order: { ...buyOrder.order!, instrument: undefined },
      fill: buyOrder.fill,
    }
    const result = mapOrder(noInstrument, 1, 2)
    if (result.kind !== 'lot') throw new Error('expected lot')
    expect(result.row.currency).toBe('CZK')
  })
})

describe('mapDividend', () => {
  it('maps a dividend item', () => {
    const dividend: T212DividendItem = {
      amount: 25.3,
      currency: 'CZK',
      grossAmountPerShare: 0.26,
      instrument: aapl,
      paidOn: '2025-02-15T00:00:00Z',
      quantity: 100,
      reference: 'div-abc',
      ticker: 'AAPL_US_EQ',
      type: 'ORDINARY',
    }
    expect(mapDividend(dividend, 1, 2)).toEqual({
      accountId: 1,
      instrumentId: 2,
      amount: '25.3',
      currency: 'CZK',
      grossAmountPerShare: '0.26',
      quantity: '100',
      type: 'ORDINARY',
      paidOn: new Date('2025-02-15T00:00:00Z'),
      reference: 'div-abc',
    })
  })
})

describe('mapTransaction', () => {
  it('maps a cash transaction', () => {
    const tx: T212TransactionItem = {
      amount: 10000,
      currency: 'CZK',
      dateTime: '2025-03-01T08:00:00Z',
      reference: 'tx-1',
      type: 'DEPOSIT',
    }
    expect(mapTransaction(tx, 1)).toEqual({
      accountId: 1,
      amount: '10000',
      currency: 'CZK',
      type: 'DEPOSIT',
      occurredAt: new Date('2025-03-01T08:00:00Z'),
      reference: 'tx-1',
    })
  })
})

describe('sumFees', () => {
  it('sums the charges of one fill as a positive amount in their shared currency', () => {
    const result = sumFees([
      { name: 'CURRENCY_CONVERSION_FEE', currency: 'CZK', quantity: -0.24, chargedAt: '2026-07-29T13:37:45Z' },
      { name: 'STAMP_DUTY_RESERVE_TAX', currency: 'CZK', quantity: -1.28, chargedAt: '2026-07-29T13:37:45Z' },
    ])
    expect(result).toEqual({ fee: '1.52', feeCurrency: 'CZK' })
  })

  it('is null when the fill carries no charges', () => {
    expect(sumFees([])).toEqual({ fee: null, feeCurrency: null })
    expect(sumFees(null)).toEqual({ fee: null, feeCurrency: null })
    expect(sumFees(undefined)).toEqual({ fee: null, feeCurrency: null })
  })

  it('ignores zero charges and entries with no currency', () => {
    expect(
      sumFees([
        { name: 'ZERO', currency: 'CZK', quantity: 0, chargedAt: null },
        { name: 'NO_CURRENCY', currency: null, quantity: -5, chargedAt: null },
      ]),
    ).toEqual({ fee: null, feeCurrency: null })
  })

  it('refuses to add up a mixed-currency set rather than guess an FX rate', () => {
    expect(
      sumFees([
        { name: 'A', currency: 'CZK', quantity: -1, chargedAt: null },
        { name: 'B', currency: 'USD', quantity: -1, chargedAt: null },
      ]),
    ).toEqual({ fee: null, feeCurrency: null })
  })
})

describe('mapOrder fees', () => {
  it('carries the fill charges onto the lot', () => {
    const withFee: T212HistoricalOrder = {
      ...buyOrder,
      fill: {
        ...buyOrder.fill!,
        walletImpact: {
          ...buyOrder.fill!.walletImpact,
          taxes: [{ name: 'CURRENCY_CONVERSION_FEE', currency: 'CZK', quantity: -0.24, chargedAt: null }],
        },
      },
    }
    const result = mapOrder(withFee, 1, 2)
    if (result.kind !== 'lot') throw new Error('unreachable')
    expect(result.row.fee).toBe('0.24')
    expect(result.row.feeCurrency).toBe('CZK')
  })
})
