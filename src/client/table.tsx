import { useMemo, useState } from 'react'
import type { MessageKey } from './i18n/cs.js'
import { useLang } from './i18n/index.js'

export type SortDir = 'asc' | 'desc'
export type Accessors<T> = Record<string, (row: T) => string | number>

const PAGE_SIZE = 25

// Client-side sorting and paging. The data is already filtered per year and per account, so it
// arrives in tens or hundreds of rows - server-side paging would be dead weight (see ARCHITECTURE).
export function useSortPage<T>(
  rows: readonly T[],
  accessors: Accessors<T>,
  defaultKey: string,
  defaultDir: SortDir = 'desc',
) {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const accessor = accessors[sort.key]
    if (!accessor) return [...rows]
    return [...rows].sort((a, b) => {
      const va = accessor(a)
      const vb = accessor(b)
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, accessors])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pages - 1)
  const view = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function toggle(key: string): void {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(0)
  }

  return { view, sort, toggle, page: safePage, pages, setPage, total: sorted.length }
}

function SortTh({
  colKey,
  label,
  sort,
  onToggle,
}: {
  colKey: string
  label: string
  sort: { key: string; dir: SortDir }
  onToggle: (key: string) => void
}) {
  const active = sort.key === colKey
  return (
    <th className="sortable" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-button" onClick={() => onToggle(colKey)}>
        {label}
        {active && <span aria-hidden="true">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )
}

// A table's sortable columns as data: [accessor key, translation key]. Every table declares its
// header once instead of repeating a SortTh block per column.
export type SortColumns = readonly (readonly [string, MessageKey])[]

export function SortHeaders({
  columns,
  sort,
  onToggle,
}: {
  columns: SortColumns
  sort: { key: string; dir: SortDir }
  onToggle: (key: string) => void
}) {
  const { t } = useLang()
  return (
    <>
      {columns.map(([key, label]) => (
        <SortTh key={key} colKey={key} label={t(label)} sort={sort} onToggle={onToggle} />
      ))}
    </>
  )
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number
  pages: number
  total: number
  onPage: (page: number) => void
}) {
  const { t } = useLang()
  if (pages <= 1) return null
  return (
    <div className="pager">
      <button type="button" className="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
        ‹
      </button>
      <span>
        {t('common.page', { page: page + 1, pages })} · {t('common.records', { total })}
      </span>
      <button type="button" className="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        ›
      </button>
    </div>
  )
}
