import { pragueDay } from '../../shared/dates.js'
import type { DividendRow, SaleRow } from './types.js'

// RFC 4180: comma separated, CRLF, quotes doubled inside quoted fields. Amounts keep the decimal
// point so the file parses the same everywhere; a spreadsheet with a Czech locale needs the import
// wizard rather than a double click.

const SALE_HEADER = [
  'instrument',
  'sold_on',
  'quantity',
  'proceeds_czk',
  'cost_czk',
  'fee_czk',
  'gain_czk',
  'time_test_met',
  'taxable',
] as const

const DIVIDEND_HEADER = [
  'instrument',
  'paid_on',
  'country',
  'type',
  'gross_czk',
  'net_czk',
  'withheld_czk',
  'effective_rate_pct',
  'treaty_rate_pct',
  'creditable_czk',
] as const

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
}

export function salesCsv(sales: readonly SaleRow[]): string {
  return toCsv(
    SALE_HEADER,
    sales.map((sale) => [
      sale.instrumentKey,
      pragueDay(sale.soldAt),
      sale.quantity,
      sale.proceedsCzk,
      sale.costCzk,
      sale.feeCzk,
      sale.gainCzk,
      String(sale.timeTestMet),
      String(sale.taxable),
    ]),
  )
}

export function dividendsCsv(dividends: readonly DividendRow[]): string {
  return toCsv(
    DIVIDEND_HEADER,
    dividends.map((dividend) => [
      dividend.instrumentKey,
      pragueDay(dividend.paidOn),
      dividend.country,
      dividend.type,
      dividend.grossCzk,
      dividend.netCzk,
      dividend.withheldCzk,
      dividend.effectiveRate,
      dividend.treatyRate ?? '',
      dividend.creditableCzk,
    ]),
  )
}
