import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { type Accessors, Pager, type SortColumns, SortHeaders, useSortPage } from '../../table.js'
import { EmptyState, Section, TableWrap } from '../../ui.js'
import { ExportButton } from './ExportButton.js'
import type { TaxSaleRow } from './types.js'

const SALE_COLUMNS: Accessors<TaxSaleRow> = {
  instrument: (row) => row.instrumentKey,
  sold: (row) => new Date(row.soldAt).getTime(),
  quantity: (row) => Number(row.quantity),
  proceeds: (row) => Number(row.proceedsCzk),
  cost: (row) => Number(row.costCzk),
  fee: (row) => Number(row.feeCzk),
  gain: (row) => Number(row.gainCzk),
}

const COLUMNS: SortColumns = [
  ['instrument', 'portfolio.col.instrument'],
  ['sold', 'taxes.sales.col.sold'],
  ['quantity', 'portfolio.col.quantity'],
  ['proceeds', 'taxes.sales.col.proceeds'],
  ['cost', 'taxes.sales.col.cost'],
  ['fee', 'taxes.sales.col.fee'],
  ['gain', 'taxes.sales.col.gain'],
]

export function SalesTable({ sales, year }: { sales: readonly TaxSaleRow[]; year: number }) {
  const { t } = useLang()
  const { czk, quantity, date } = useFormat()
  const table = useSortPage(sales, SALE_COLUMNS, 'sold', 'desc')

  return (
    <Section title={t('taxes.sales.title', { year })} hint={t('taxes.sales.hint')}>
      {sales.length === 0 ? (
        <EmptyState>{t('taxes.sales.empty', { year })}</EmptyState>
      ) : (
        <>
          <ExportButton kind="sales" year={year} />
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <SortHeaders columns={COLUMNS} sort={table.sort} onToggle={table.toggle} />
                  <th>{t('taxes.sales.col.timeTest')}</th>
                  <th>{t('taxes.sales.col.taxable')}</th>
                </tr>
              </thead>
              <tbody>
                {table.view.map((row) => (
                  <tr key={`${row.saleId}-${row.lotId}`}>
                    <td>
                      <span className="ticker">{row.instrumentKey}</span>
                      {row.lotId === 0 && <span className="name neg">{t('taxes.sales.noLot')}</span>}
                    </td>
                    <td className="num">{date(row.soldAt)}</td>
                    <td className="num">{quantity(row.quantity)}</td>
                    <td className="num">{czk(row.proceedsCzk, true)}</td>
                    <td className="num">{czk(row.costCzk, true)}</td>
                    <td className="num muted">{czk(row.feeCzk, true)}</td>
                    <td className="num">
                      <span className={Number(row.gainCzk) >= 0 ? 'pos' : 'neg'}>{czk(row.gainCzk, true)}</span>
                    </td>
                    <td>
                      {row.timeTestMet ? (
                        <span className="pos">{t('taxes.sales.testMet')}</span>
                      ) : (
                        <span className="muted">{t('common.no')}</span>
                      )}
                    </td>
                    <td>
                      {row.taxable ? (
                        <span className="neg">{t('common.yes')}</span>
                      ) : (
                        <span className="muted">{t('common.no')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={table.page} pages={table.pages} total={table.total} onPage={table.setPage} />
          </TableWrap>
        </>
      )}
    </Section>
  )
}
