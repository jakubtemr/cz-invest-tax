import { describe, expect, it } from 'vitest'
import { dividendsCsv, salesCsv } from './csv.js'
import type { DividendRow, SaleRow } from './types.js'

const sale: SaleRow = {
  saleId: 1,
  lotId: 2,
  instrumentKey: 'AAPL_US_EQ',
  // 23:30 UTC on 31 Dec is already 1 Jan in Prague, which is the day that belongs in the return
  soldAt: new Date('2025-12-31T23:30:00Z'),
  quantity: '10',
  proceedsCzk: '36000.00',
  costCzk: '24000.00',
  feeCzk: '12.00',
  gainCzk: '12000.00',
  timeTestMet: false,
  taxable: true,
}

const dividend: DividendRow = {
  instrumentId: 1,
  instrumentKey: 'AAPL_US_EQ',
  reference: 'div-1',
  paidOn: new Date('2026-02-15T10:00:00Z'),
  country: 'US',
  grossCzk: '240.00',
  netCzk: '204.00',
  withheldCzk: '36.00',
  effectiveRate: '15.00',
  treatyRate: '15.00',
  overTreaty: false,
  creditableCzk: '36.00',
  type: 'ORDINARY',
}

describe('salesCsv', () => {
  it('writes a header and one CRLF-separated row per sale, dated by the Prague day', () => {
    const lines = salesCsv([sale]).split('\r\n')
    expect(lines[0]).toBe('instrument,sold_on,quantity,proceeds_czk,cost_czk,fee_czk,gain_czk,time_test_met,taxable')
    expect(lines[1]).toBe('AAPL_US_EQ,2026-01-01,10,36000.00,24000.00,12.00,12000.00,false,true')
  })

  it('emits only the header for an empty year', () => {
    expect(salesCsv([]).split('\r\n')).toHaveLength(1)
  })

  it('quotes a field containing a separator and doubles inner quotes', () => {
    const awkward = { ...sale, instrumentKey: 'A,B "C"' }
    expect(salesCsv([awkward]).split('\r\n')[1]).toContain('"A,B ""C"""')
  })
})

describe('dividendsCsv', () => {
  it('carries country, effective rate, treaty rate and the creditable amount', () => {
    const lines = dividendsCsv([dividend]).split('\r\n')
    expect(lines[0]).toContain('treaty_rate_pct')
    expect(lines[1]).toBe('AAPL_US_EQ,2026-02-15,US,ORDINARY,240.00,204.00,36.00,15.00,15.00,36.00')
  })

  it('leaves the treaty column empty when no treaty rate is known', () => {
    const unknown = { ...dividend, treatyRate: null, country: 'UNKNOWN' }
    expect(dividendsCsv([unknown]).split('\r\n')[1]).toContain(',,36.00')
  })
})
