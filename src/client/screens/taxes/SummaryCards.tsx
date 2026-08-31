import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { Card } from '../../ui.js'
import type { TaxOverviewData } from './types.js'

export function SummaryCards({ overview, year }: { overview: TaxOverviewData; year: number }) {
  const { t } = useLang()
  const { czk } = useFormat()
  const { summary } = overview
  const overCap = Number(summary.exemptProceedsOverCapCzk)

  return (
    <div className="account-cards">
      <Card label={t('taxes.card.proceeds', { year })} value={czk(summary.totalSaleProceedsCzk)}>
        {summary.under100kExemption ? (
          <span className="pos">{t('taxes.card.under100k', { limit: czk(summary.saleExemptionLimitCzk) })}</span>
        ) : (
          <span className="neg">{t('taxes.card.over100k', { limit: czk(summary.saleExemptionLimitCzk) })}</span>
        )}
        <span>{t('taxes.card.limitBase', { amount: czk(summary.limitProceedsCzk) })}</span>
      </Card>

      <Card label={t('taxes.card.taxableGain')} value={czk(summary.taxable.baseCzk)}>
        <span>
          {t('taxes.card.proceedsMinusCost', {
            proceeds: czk(summary.taxable.proceedsCzk),
            cost: czk(summary.taxable.costCzk),
          })}
        </span>
        {Number(summary.taxable.gainCzk) < 0 && <span className="neg">{t('taxes.card.loss')}</span>}
      </Card>

      <Card label={t('taxes.card.dividends', { year })} value={czk(summary.dividends.grossCzk)}>
        <span>{t('taxes.card.withheldAbroad', { amount: czk(summary.dividends.withheldCzk) })}</span>
      </Card>

      <Card label={t('taxes.card.interest', { year })} value={czk(summary.interestCzk)}>
        <span>{t('taxes.card.section8')}</span>
        {overCap > 0 && (
          <span className="neg">
            {t('taxes.card.exemptOverCap', { amount: czk(summary.exemptProceedsOverCapCzk) })}
          </span>
        )}
      </Card>
    </div>
  )
}
