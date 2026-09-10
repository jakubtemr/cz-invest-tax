import { useEffect, useState } from 'react'
import { api, errorText } from '../../api.js'
import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { Card, type Tone } from '../../ui.js'

type Summary = Awaited<ReturnType<typeof api.benchmark.summary>>
type State = { kind: 'loading' } | { kind: 'err'; message: string } | { kind: 'ok'; summary: Summary }

function tone(value: string): Tone {
  const amount = Number(value)
  return amount > 0 ? 'pos' : amount < 0 ? 'neg' : 'muted'
}

function signed(text: string, value: string): string {
  return Number(value) > 0 ? `+${text}` : text
}

// The level to beat: what the same deposits, made into the index on the same days, would be worth.
// Loaded on its own so a price vendor outage cannot take the portfolio screen down with it.
export function BenchmarkCard() {
  const { t } = useLang()
  const { czk, date } = useFormat()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    api.benchmark
      .summary()
      .then((summary) => {
        if (!cancelled) setState({ kind: 'ok', summary })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'err', message: errorText(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <Card label={t('benchmark.label')} value={t('common.none')}>
        <span>{t('common.loading')}</span>
      </Card>
    )
  }
  if (state.kind === 'err') {
    return (
      <Card label={t('benchmark.label')} value={t('common.none')}>
        <span className="neg">{t('benchmark.loadError', { error: state.message })}</span>
      </Card>
    )
  }
  const { summary } = state
  if (summary.status !== 'ready') {
    return (
      <Card label={t('benchmark.label')} value={t('common.none')}>
        <span>{t(summary.status === 'noFlows' ? 'benchmark.noFlows' : 'benchmark.noValuation')}</span>
      </Card>
    )
  }

  const difference = Number(summary.differencePct)
  const verdict =
    difference > 0
      ? t('benchmark.ahead', { pct: summary.differencePct })
      : difference < 0
        ? t('benchmark.behind', { pct: summary.differencePct.slice(1) })
        : t('benchmark.even')

  return (
    <Card
      label={t('benchmark.label')}
      value={signed(czk(summary.differenceCzk), summary.differenceCzk)}
      tone={tone(summary.differenceCzk)}
    >
      <span>
        <b className={tone(summary.differenceCzk)}>{verdict}</b>
      </span>
      <span>
        {t('benchmark.level')} <b>{czk(summary.benchmarkValueCzk)}</b>
      </span>
      <span>
        {t('benchmark.portfolio')} <b>{czk(summary.portfolioValueCzk)}</b>
      </span>
      <span>
        {t('benchmark.invested')} <b>{czk(summary.netInvestedCzk)}</b>
      </span>
      <span>
        {t('benchmark.annual', {
          mine: summary.portfolioXirrPct,
          index: summary.benchmarkXirrPct,
          alpha: signed(summary.alphaPp, summary.alphaPp),
        })}
      </span>
      <span title={t('benchmark.hint')}>
        {t('benchmark.period', { since: date(summary.since), asOf: date(summary.asOf) })}
      </span>
    </Card>
  )
}
