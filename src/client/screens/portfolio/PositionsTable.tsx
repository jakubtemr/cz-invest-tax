import { useMemo } from 'react'
import type { OverviewAccount, OverviewPosition } from '../../api.js'
import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { type Accessors, Pager, type SortColumns, SortHeaders, useSortPage } from '../../table.js'
import { EmptyState, InstrumentCell, TableWrap } from '../../ui.js'
import { PnlCell } from './PnlCell.js'

type PositionRow = { account: OverviewAccount; position: OverviewPosition }

const POSITION_COLUMNS: Accessors<PositionRow> = {
  instrument: (row) => row.position.ticker,
  broker: (row) => row.account.broker,
  quantity: (row) => Number(row.position.quantity),
  avgPrice: (row) => Number(row.position.averagePrice ?? 0),
  price: (row) => Number(row.position.currentPrice ?? 0),
  value: (row) => Number(row.position.currentValue ?? 0),
  pnl: (row) => Number(row.position.unrealizedPnl ?? 0),
}

const COLUMNS: SortColumns = [
  ['instrument', 'portfolio.col.instrument'],
  ['broker', 'portfolio.col.broker'],
  ['quantity', 'portfolio.col.quantity'],
  ['avgPrice', 'portfolio.col.avgPrice'],
  ['price', 'portfolio.col.price'],
  ['value', 'portfolio.col.value'],
  ['pnl', 'portfolio.col.pnl'],
]
const ALLOCATION_BAR_SCALE = 0.6
const MIN_BAR_PERCENT = 2

export function PositionsTable({ accounts }: { accounts: readonly OverviewAccount[] }) {
  const { t } = useLang()
  const { money, quantity } = useFormat()
  // Allocation is relative to the account and currency, never across unconverted currencies.
  const { rows, allocationBase } = useMemo(() => {
    const flat = accounts.flatMap((account) => account.positions.map((position) => ({ account, position })))
    const base = new Map<string, number>()
    for (const { account, position } of flat) {
      const key = `${account.id}:${position.valueCurrency}`
      base.set(key, (base.get(key) ?? 0) + Number(position.currentValue ?? 0))
    }
    return { rows: flat, allocationBase: base }
  }, [accounts])
  const table = useSortPage(rows, POSITION_COLUMNS, 'value', 'desc')

  function allocation(account: OverviewAccount, position: OverviewPosition): number | null {
    const base = allocationBase.get(`${account.id}:${position.valueCurrency}`) ?? 0
    const value = Number(position.currentValue ?? 0)
    if (base <= 0 || value <= 0) return null
    return (value / base) * 100
  }

  if (rows.length === 0) return <EmptyState>{t('portfolio.positions.empty')}</EmptyState>

  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <SortHeaders columns={COLUMNS} sort={table.sort} onToggle={table.toggle} />
            <th>{t('portfolio.col.allocation')}</th>
          </tr>
        </thead>
        <tbody>
          {table.view.map(({ account, position }) => {
            const share = allocation(account, position)
            return (
              <tr key={position.id}>
                <InstrumentCell ticker={position.ticker} name={position.name} />
                <td className="muted">{account.broker}</td>
                <td className="num">{quantity(position.quantity)}</td>
                <td className="num">{money(position.averagePrice, position.instrumentCurrency)}</td>
                <td className="num">{money(position.currentPrice, position.instrumentCurrency)}</td>
                <td className="num">{money(position.currentValue, position.valueCurrency)}</td>
                <td className="num">
                  <PnlCell value={position.unrealizedPnl} currency={position.valueCurrency} />
                </td>
                <td className="num">
                  {share == null ? (
                    <span className="muted">{t('common.none')}</span>
                  ) : (
                    <>
                      <span
                        className="alloc-bar"
                        style={{ width: `${Math.max(share, MIN_BAR_PERCENT) * ALLOCATION_BAR_SCALE}px` }}
                      />
                      {share.toFixed(1)} %
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Pager page={table.page} pages={table.pages} total={table.total} onPage={table.setPage} />
    </TableWrap>
  )
}
