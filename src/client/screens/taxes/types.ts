import type { api } from '../../api.js'

export type TaxOverviewData = Awaited<ReturnType<typeof api.tax.overview>>
export type OpenLotRow = TaxOverviewData['openLots'][number]
export type TaxSaleRow = TaxOverviewData['summary']['sales'][number]
export type TaxDividendRow = TaxOverviewData['summary']['dividends']['items'][number]
