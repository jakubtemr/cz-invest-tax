import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { EmptyState, Section, TableWrap } from '../../ui.js'
import type { TaxOverviewData } from './types.js'

const CREDIT_COLUMNS = ['country', 'gross', 'withheld', 'creditable', 'maxCredit', 'credit', 'residual'] as const

export function TaxBreakdown({
  overview,
  otherBases,
  onOtherBases,
}: {
  overview: TaxOverviewData
  otherBases: string
  onOtherBases: (value: string) => void
}) {
  const { t } = useLang()
  const { czk } = useFormat()
  const { computation } = overview

  const rows: readonly [string, string, boolean][] = [
    [t('taxes.tax.section8'), czk(computation.section8BaseCzk, true), false],
    [t('taxes.tax.section10'), czk(computation.section10BaseCzk, true), false],
    [t('taxes.tax.otherBasesRow'), czk(computation.otherBasesCzk, true), false],
    [t('taxes.tax.totalBase'), czk(computation.totalBaseCzk, true), false],
    [t('taxes.tax.roundedBase'), czk(computation.roundedBaseCzk, true), true],
    [t('taxes.tax.baseRateTax'), czk(computation.baseRateTaxCzk, true), false],
    [
      t('taxes.tax.topRateTax', { threshold: czk(computation.topRateThresholdCzk) }),
      czk(computation.topRateTaxCzk, true),
      false,
    ],
    [t('taxes.tax.taxBefore'), czk(computation.taxBeforeCreditCzk, true), true],
    [t('taxes.tax.credit'), `− ${czk(computation.creditCzk, true)}`, false],
    [t('taxes.tax.taxAfter'), czk(computation.taxAfterCreditCzk, true), true],
  ]

  return (
    <Section title={t('taxes.tax.title')} hint={t('taxes.tax.hint')}>
      <form className="lot-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          {t('taxes.tax.otherBases')}
          <input
            inputMode="decimal"
            value={otherBases}
            onChange={(event) => onOtherBases(event.target.value)}
            placeholder="0"
          />
        </label>
        <p className="section-hint field-hint">{t('taxes.tax.otherBasesHint')}</p>
      </form>

      <TableWrap>
        <table>
          <tbody>
            {rows.map(([label, value, strong]) => (
              <tr key={label} className={strong ? 'strong-row' : ''}>
                <td>{label}</td>
                <td className="num">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="subhead">{t('taxes.credit.title')}</h3>
      {computation.creditsByCountry.length === 0 ? (
        <EmptyState>{t('common.none')}</EmptyState>
      ) : (
        <TableWrap>
          <table>
            <thead>
              <tr>
                {CREDIT_COLUMNS.map((key) => (
                  <th key={key}>{t(`taxes.credit.${key}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computation.creditsByCountry.map((row) => (
                <tr key={row.country}>
                  <td>{row.country}</td>
                  <td className="num">{czk(row.grossCzk, true)}</td>
                  <td className="num">{czk(row.withheldCzk, true)}</td>
                  <td className="num">{czk(row.creditableCzk, true)}</td>
                  <td className="num muted">{czk(row.maxCreditCzk, true)}</td>
                  <td className="num">{czk(row.creditCzk, true)}</td>
                  <td className={`num ${Number(row.residualCzk) > 0 ? 'neg' : 'muted'}`}>
                    {czk(row.residualCzk, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {Number(computation.nonCreditableResidualCzk) > 0 && (
        <p className="section-hint">{t('taxes.tax.residualHint')}</p>
      )}
    </Section>
  )
}
