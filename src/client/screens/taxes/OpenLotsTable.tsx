import { daysFromToday, pragueDay } from '../../../shared/dates.js'
import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { type Accessors, Pager, type SortColumns, SortHeaders, useSortPage } from '../../table.js'
import { EmptyState, InstrumentCell, Section, TableWrap } from '../../ui.js'
import type { OpenLotRow } from './types.js'

const OPEN_LOT_COLUMNS: Accessors<OpenLotRow> = {
  instrument: (row) => row.instrumentKey,
  quantity: (row) => Number(row.remainingQuantity),
  price: (row) => Number(row.pricePerShare),
  acquired: (row) => new Date(row.acquiredAt).getTime(),
  exemptFrom: (row) => new Date(row.exemptFrom).getTime(),
}

const COLUMNS: SortColumns = [
  ['instrument', 'portfolio.col.instrument'],
  ['quantity', 'portfolio.col.quantity'],
  ['price', 'portfolio.manual.price'],
  ['acquired', 'taxes.lots.col.acquired'],
  ['exemptFrom', 'taxes.lots.col.exemptFrom'],
]

export function OpenLotsTable({ openLots }: { openLots: readonly OpenLotRow[] }) {
  const { t } = useLang()
  const { money, quantity, date } = useFormat()
  const table = useSortPage(openLots, OPEN_LOT_COLUMNS, 'exemptFrom', 'asc')

  return (
    <Section title={t('taxes.lots.title')} hint={t('taxes.lots.hint')}>
      {openLots.length === 0 ? (
        <EmptyState>{t('taxes.lots.empty')}</EmptyState>
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <SortHeaders columns={COLUMNS} sort={table.sort} onToggle={table.toggle} />
                <th>{t('taxes.lots.col.countdown')}</th>
              </tr>
            </thead>
            <tbody>
              {table.view.map((lot) => (
                <tr key={lot.lotId}>
                  <InstrumentCell ticker={lot.instrumentKey} name={lot.instrumentName} />
                  <td className="num">{quantity(lot.remainingQuantity)}</td>
                  <td className="num">{money(lot.pricePerShare, lot.currency)}</td>
                  <td className="num">{date(lot.acquiredAt)}</td>
                  <td className="num">{date(lot.exemptFrom)}</td>
                  <td className="num">
                    {lot.alreadyExempt ? (
                      <span className="pos">{t('taxes.lots.exempt')}</span>
                    ) : (
                      <span>{t('taxes.lots.days', { days: daysFromToday(pragueDay(new Date(lot.exemptFrom))) })}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={table.page} pages={table.pages} total={table.total} onPage={table.setPage} />
        </TableWrap>
      )}
    </Section>
  )
}
