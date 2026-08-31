import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'

export function PnlCell({ value, currency }: { value: string | null; currency: string | null }) {
  const { t } = useLang()
  const { money } = useFormat()
  if (value == null) return <span className="muted">{t('common.none')}</span>
  const amount = Number(value)
  return <span className={amount > 0 ? 'pos' : amount < 0 ? 'neg' : 'muted'}>{money(value, currency)}</span>
}
