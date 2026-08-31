import { useCallback, useEffect, useState } from 'react'
import { REPAIRABLE_CODES } from '../../../server/tax/warnings.js'
import { api, errorText } from '../../api.js'
import { useLang } from '../../i18n/index.js'
import { useNotices } from '../../notices.js'
import { EmptyState, NoticeBanner, Skeleton, Tabs } from '../../ui.js'
import { DividendsTable } from './DividendsTable.js'
import { OpenLotsTable } from './OpenLotsTable.js'
import { SalesTable } from './SalesTable.js'
import { SummaryCards } from './SummaryCards.js'
import { TaxBreakdown } from './TaxBreakdown.js'
import { TransferForm } from './TransferForm.js'
import type { TaxOverviewData } from './types.js'

type Tab = 'sales' | 'dividends' | 'lots' | 'tax'

const DEBOUNCE_MS = 400

export function Taxes() {
  const { t } = useLang()
  const [year, setYear] = useState(new Date().getFullYear())
  const [otherBases, setOtherBases] = useState('')
  const [overview, setOverview] = useState<TaxOverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Retyping the other-bases figure must not fire a request per keystroke.
  const [debouncedBases, setDebouncedBases] = useState(otherBases)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBases(otherBases), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [otherBases])

  const load = useCallback(() => {
    setLoading(true)
    api.tax
      .overview({ year, otherBasesCzk: debouncedBases.trim() || undefined })
      .then((data) => {
        setOverview(data)
        setError(null)
      })
      .catch((err: unknown) => setError(errorText(err)))
      .finally(() => setLoading(false))
  }, [year, debouncedBases])

  useEffect(() => load(), [load])

  // The year row outlives an error on purpose: a year with no constants must not strand the user
  // on a blank screen with no way back to one that works.
  const supported = overview?.supportedYears ?? []
  return (
    <>
      <div className="year-row">
        {(overview?.availableYears ?? [year]).map((available) => {
          const unsupported = supported.length > 0 && !supported.includes(available)
          return (
            <button
              key={available}
              type="button"
              className={`nav-link ${available === year ? 'active' : ''}`}
              disabled={unsupported}
              title={unsupported ? t('taxes.yearUnsupported', { year: available }) : undefined}
              onClick={() => setYear(available)}
            >
              {available}
            </button>
          )
        })}
      </div>
      {error ? (
        <EmptyState>{t('taxes.loadError', { error })}</EmptyState>
      ) : loading || !overview ? (
        <Skeleton rows={6} />
      ) : (
        <TaxesContent
          overview={overview}
          year={year}
          otherBases={otherBases}
          onOtherBases={setOtherBases}
          onFixed={load}
        />
      )}
    </>
  )
}

function TaxesContent({
  overview,
  year,
  otherBases,
  onOtherBases,
  onFixed,
}: {
  overview: TaxOverviewData
  year: number
  otherBases: string
  onOtherBases: (value: string) => void
  onFixed: () => void
}) {
  const { t } = useLang()
  const [tab, setTab] = useState<Tab>('sales')
  const notices = useNotices(overview.warnings)
  const needsRepair = overview.warnings.some((warning) =>
    (REPAIRABLE_CODES as readonly string[]).includes(warning.code),
  )

  const tabs = [
    { key: 'sales' as const, label: t('taxes.tab.sales', { count: overview.summary.sales.length }) },
    { key: 'dividends' as const, label: t('taxes.tab.dividends', { count: overview.summary.dividends.items.length }) },
    { key: 'lots' as const, label: t('taxes.tab.lots', { count: overview.openLots.length }) },
    { key: 'tax' as const, label: t('taxes.tab.tax') },
  ]

  return (
    <>
      <NoticeBanner notices={notices} />
      {needsRepair && <TransferForm onDone={onFixed} />}

      <SummaryCards overview={overview} year={year} />
      <Tabs tabs={tabs} active={tab} onSelect={setTab} />

      {tab === 'sales' && <SalesTable sales={overview.summary.sales} year={year} />}
      {tab === 'dividends' && (
        <DividendsTable dividends={overview.summary.dividends.items} year={year} onChanged={onFixed} />
      )}
      {tab === 'lots' && <OpenLotsTable openLots={overview.openLots} />}
      {tab === 'tax' && <TaxBreakdown overview={overview} otherBases={otherBases} onOtherBases={onOtherBases} />}

      <p className="section-hint">{t('taxes.disclaimer')}</p>
    </>
  )
}
