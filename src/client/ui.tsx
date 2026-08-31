import type { ReactNode } from 'react'
import { useLang } from './i18n/index.js'

// Shared presentation primitives. Screens compose these instead of writing raw markup, so a card
// or a warning banner looks the same wherever it turns up.

export function Card({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="card">
      <div className="broker">{label}</div>
      <div className="big">{value}</div>
      {children && <div className="sub">{children}</div>}
    </div>
  )
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </section>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export type Severity = 'info' | 'warn' | 'error'

export interface Notice {
  readonly key: string
  readonly severity: Severity
  readonly text: string
}

const SEVERITY_MARK: Record<Severity, string> = { info: 'i', warn: '!', error: '!!' }

export function NoticeBanner({ notices }: { notices: readonly Notice[] }) {
  if (notices.length === 0) return null
  return (
    <div className="notices">
      {notices.map((notice) => (
        <div key={notice.key} className={`notice ${notice.severity}`}>
          <span className="notice-mark" aria-hidden="true">
            {SEVERITY_MARK[notice.severity]}
          </span>
          <span>{notice.text}</span>
        </div>
      ))}
    </div>
  )
}

// A skeleton rather than the word "loading": the shape of what is coming is more informative than
// a spinner, and it stops the layout jumping when the data lands.
export function Skeleton({ rows = 3 }: { rows?: number }) {
  const { t } = useLang()
  return (
    <div className="skeleton" role="status" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, index) => `skeleton-${index}`).map((key) => (
        <div key={key} className="skeleton-row" />
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly { key: T; label: string }[]
  active: T
  onSelect: (key: T) => void
}) {
  return (
    <div className="tab-row" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          className={`nav-link tab ${tab.key === active ? 'active' : ''}`}
          onClick={() => onSelect(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// The ticker-and-name cell every table opens with. Six hand-written copies had already drifted:
// two of them dropped the name line.
export function InstrumentCell({ ticker, name }: { ticker: string; name?: string | null }) {
  return (
    <td>
      <span className="ticker">{ticker}</span>
      {name != null && <span className="name">{name}</span>}
    </td>
  )
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap">{children}</div>
}

export function FormError({ children }: { children: ReactNode }) {
  return <div className="form-error">{children}</div>
}
