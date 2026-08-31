import type { OverviewAccount } from '../../api.js'
import { useFormat } from '../../format.js'
import type { MessageKey } from '../../i18n/cs.js'
import { useLang } from '../../i18n/index.js'
import { Card } from '../../ui.js'
import { PnlCell } from './PnlCell.js'

export function AccountCard({ account }: { account: OverviewAccount }) {
  const { t } = useLang()
  const { money } = useFormat()
  const snapshot = account.snapshot
  const valued = account.positions.filter((position) => position.currentValue != null)
  // Only add up a single currency - mixed currencies without an FX conversion stay unsummed.
  const singleCurrency = new Set(valued.map((position) => position.valueCurrency)).size === 1
  const totalFromPositions =
    valued.length > 0 && singleCurrency
      ? String(valued.reduce((sum, position) => sum + Number(position.currentValue), 0))
      : null
  const currency = snapshot?.currency ?? valued[0]?.valueCurrency ?? account.currency

  return (
    <Card
      label={t(`broker.${account.broker}` as MessageKey)}
      value={money(snapshot?.totalValue ?? totalFromPositions, currency)}
    >
      {snapshot ? (
        <>
          <span>
            {t('portfolio.card.cash')} <b>{money(snapshot.cash, currency)}</b>
          </span>
          <span>
            {t('portfolio.card.unrealized')} <PnlCell value={snapshot.unrealizedPnl} currency={currency} />
          </span>
        </>
      ) : (
        <span>
          {t('portfolio.card.positions')} <b>{account.positions.length}</b>
        </span>
      )}
    </Card>
  )
}
