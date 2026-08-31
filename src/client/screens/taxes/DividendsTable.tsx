import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { type Accessors, Pager, type SortColumns, SortHeaders, useSortPage } from '../../table.js'
import { EmptyState, InstrumentCell, Section, TableWrap } from '../../ui.js'
import { CountryCell } from './CountryCell.js'
import { ExportButton } from './ExportButton.js'
import type { TaxDividendRow } from './types.js'

const DIVIDEND_COLUMNS: Accessors<TaxDividendRow> = {
  instrument: (row) => row.instrumentKey,
  date: (row) => new Date(row.paidOn).getTime(),
  country: (row) => row.country,
  gross: (row) => Number(row.grossCzk),
  net: (row) => Number(row.netCzk),
  withheld: (row) => Number(row.withheldCzk),
  effective: (row) => Number(row.effectiveRate),
  creditable: (row) => Number(row.creditableCzk),
}

const IDENTITY: SortColumns = [
  ['instrument', 'portfolio.col.instrument'],
  ['date', 'taxes.dividends.col.date'],
  ['country', 'taxes.dividends.col.country'],
]

const AMOUNTS: SortColumns = [
  ['gross', 'taxes.dividends.col.gross'],
  ['net', 'taxes.dividends.col.net'],
  ['withheld', 'taxes.dividends.col.withheld'],
  ['effective', 'taxes.dividends.col.effective'],
]

const CREDITABLE: SortColumns = [['creditable', 'taxes.dividends.col.creditable']]

export function DividendsTable({
  dividends,
  year,
  onChanged,
}: {
  dividends: readonly TaxDividendRow[]
  year: number
  onChanged: () => void
}) {
  const { t } = useLang()
  const { czk, percent, date } = useFormat()
  const table = useSortPage(dividends, DIVIDEND_COLUMNS, 'date', 'desc')

  return (
    <Section title={t('taxes.dividends.title', { year })} hint={t('taxes.dividends.hint')}>
      {dividends.length === 0 ? (
        <EmptyState>{t('taxes.dividends.empty', { year })}</EmptyState>
      ) : (
        <>
          <ExportButton kind="dividends" year={year} />
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <SortHeaders columns={IDENTITY} sort={table.sort} onToggle={table.toggle} />
                  <th>{t('taxes.dividends.col.type')}</th>
                  <SortHeaders columns={AMOUNTS} sort={table.sort} onToggle={table.toggle} />
                  <th>{t('taxes.dividends.col.treaty')}</th>
                  <SortHeaders columns={CREDITABLE} sort={table.sort} onToggle={table.toggle} />
                </tr>
              </thead>
              <tbody>
                {table.view.map((item) => (
                  <tr key={item.reference}>
                    <InstrumentCell ticker={item.instrumentKey} />
                    <td className="num">{date(item.paidOn)}</td>
                    <CountryCell instrumentId={item.instrumentId} country={item.country} onChanged={onChanged} />
                    <td className="muted">{item.type}</td>
                    <td className="num">{czk(item.grossCzk, true)}</td>
                    <td className="num">{czk(item.netCzk, true)}</td>
                    <td className="num">{czk(item.withheldCzk, true)}</td>
                    <td className={`num ${item.overTreaty ? 'neg' : ''}`}>{percent(item.effectiveRate)}</td>
                    <td className="num muted">{percent(item.treatyRate)}</td>
                    <td className="num">{czk(item.creditableCzk, true)}</td>
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
