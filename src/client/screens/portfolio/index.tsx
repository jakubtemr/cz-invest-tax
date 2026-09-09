import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorText, type Overview } from '../../api.js'
import { useLang } from '../../i18n/index.js'
import { EmptyState, Section, Skeleton } from '../../ui.js'
import { AccountCard } from './AccountCard.js'
import { ManualSection } from './ManualSection.js'
import { PositionsTable } from './PositionsTable.js'

type SyncStatus = Awaited<ReturnType<typeof api.sync.status>>

// The sync state holds the STATUS, not a finished sentence: a formatted note would have to be
// rebuilt on every language switch, which used to drag the whole callback chain - and with it the
// mount effect - along with it, refetching the portfolio on each toggle.
type SyncState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running'; status: SyncStatus }
  | { kind: 'done'; status: SyncStatus }
  | { kind: 'err'; message: string }

const POLL_INTERVAL_MS = 2000
const MS_PER_SECOND = 1000

export function Portfolio() {
  const { t } = useLang()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle' })
  const pollingRef = useRef(false)

  const reload = useCallback(() => {
    api.portfolio
      .overview()
      .then((data) => {
        setOverview(data)
        setLoadError(null)
      })
      .catch((err: unknown) => setLoadError(errorText(err)))
  }, [])

  // The sync runs on the server in the background; the UI only follows it by polling the status.
  const followSync = useCallback(
    async (initial: SyncStatus) => {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        let status = initial
        while (status.running) {
          setSyncState({ kind: 'running', status })
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          status = await api.sync.status()
        }
        if (status.error) setSyncState({ kind: 'err', message: status.error })
        else if (status.finishedAt) setSyncState({ kind: 'done', status })
        reload()
      } catch (err) {
        setSyncState({ kind: 'err', message: errorText(err) })
      } finally {
        pollingRef.current = false
      }
    },
    [reload],
  )

  useEffect(() => {
    reload()
    // After a page reload, pick up a sync that was already running.
    api.sync
      .status()
      .then((status) => {
        if (status.running) void followSync(status)
      })
      .catch(() => {
        // The server is unreachable - the overview load error already says so.
      })
  }, [reload, followSync])

  async function runSync(): Promise<void> {
    setSyncState({ kind: 'starting' })
    try {
      await followSync(await api.sync.t212())
    } catch (err) {
      setSyncState({ kind: 'err', message: errorText(err) })
    }
  }

  if (loadError) return <EmptyState>{t('portfolio.loadError', { error: loadError })}</EmptyState>
  if (!overview) return <Skeleton rows={5} />

  const busy = syncState.kind === 'running' || syncState.kind === 'starting'

  return (
    <>
      {overview.accounts.length > 0 && (
        <div className="account-cards">
          {overview.accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      )}

      <div className="sync-row">
        <button type="button" onClick={runSync} disabled={busy}>
          {busy ? t('portfolio.sync.running') : t('portfolio.sync.start')}
        </button>
        <SyncNote state={syncState} />
      </div>

      <Section title={t('portfolio.positions.title')} hint={t('portfolio.positions.hint')}>
        <PositionsTable accounts={overview.accounts} />
      </Section>

      <ManualSection overview={overview} onChanged={reload} />
    </>
  )
}

function SyncNote({ state }: { state: SyncState }) {
  const { t, tDynamic } = useLang()
  switch (state.kind) {
    case 'idle':
      return null
    case 'starting':
      return <span className="sync-note">{t('portfolio.sync.starting')}</span>
    case 'err':
      return <span className="sync-note err">{state.message}</span>
    case 'running':
      return (
        <span className="sync-note">
          {t('portfolio.sync.progress', {
            ...counts(state.status),
            phase: tDynamic(`portfolio.phase.${state.status.phase}`),
            pages: state.status.pagesFetched,
            seconds: state.status.startedAt
              ? Math.round((Date.now() - new Date(state.status.startedAt).getTime()) / MS_PER_SECOND)
              : 0,
          })}
        </span>
      )
    case 'done':
      return (
        <span className="sync-note ok">
          {t('portfolio.sync.done', { ...counts(state.status), positions: state.status.positions })}
        </span>
      )
  }
}

function counts(status: SyncStatus): Record<string, number> {
  return {
    lots: status.lotsAdded,
    sales: status.salesAdded,
    dividends: status.dividendsAdded,
    transactions: status.transactionsAdded,
  }
}
