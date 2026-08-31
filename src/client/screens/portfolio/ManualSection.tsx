import { type ChangeEvent, type SyntheticEvent, useState } from 'react'
import { api, errorText, type Overview } from '../../api.js'
import { useFormat } from '../../format.js'
import { useLang } from '../../i18n/index.js'
import { FormError, InstrumentCell, Section, TableWrap } from '../../ui.js'

const EMPTY_LOT_FORM = {
  ticker: '',
  name: '',
  currency: 'USD',
  quantity: '',
  pricePerShare: '',
  acquiredAt: '',
  broker: 'F24' as 'F24' | 'T212',
}

const CURRENCY_CODE_LENGTH = 3

export function ManualSection({ overview, onChanged }: { overview: Overview; onChanged: () => void }) {
  const { t } = useLang()
  const { money, quantity, date } = useFormat()
  const [form, setForm] = useState(EMPTY_LOT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prices, setPrices] = useState<Record<number, string>>({})
  const [confirmingLotId, setConfirmingLotId] = useState<number | null>(null)

  const f24Positions = overview.accounts.filter((account) => account.broker === 'F24').flatMap((a) => a.positions)

  const report = (err: unknown): void => setError(errorText(err))

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.manual.addLot({
        ticker: form.ticker.trim(),
        name: form.name.trim() || null,
        currency: form.currency.trim().toUpperCase(),
        quantity: form.quantity.trim(),
        pricePerShare: form.pricePerShare.trim(),
        acquiredAt: form.acquiredAt,
        broker: form.broker,
      })
      setForm(EMPTY_LOT_FORM)
      onChanged()
    } catch (err) {
      report(err)
    } finally {
      setBusy(false)
    }
  }

  async function savePrice(instrumentId: number): Promise<void> {
    const price = prices[instrumentId]?.trim()
    if (!price) return
    try {
      await api.manual.setPrice({ instrumentId, currentPrice: price })
      setPrices((current) => ({ ...current, [instrumentId]: '' }))
      onChanged()
    } catch (err) {
      report(err)
    }
  }

  // Deleting takes two clicks - the first one only turns the button into a confirmation.
  async function removeLot(lotId: number): Promise<void> {
    if (confirmingLotId !== lotId) {
      setConfirmingLotId(lotId)
      return
    }
    setConfirmingLotId(null)
    try {
      await api.manual.removeLot({ lotId })
      onChanged()
    } catch (err) {
      report(err)
    }
  }

  const set = (key: keyof typeof EMPTY_LOT_FORM) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Section title={t('portfolio.manual.title')} hint={t('portfolio.manual.hint')}>
      <form className="lot-form" onSubmit={submit}>
        <label>
          {t('portfolio.manual.ticker')}
          <input required value={form.ticker} onChange={set('ticker')} placeholder="INTC.US" />
        </label>
        <label>
          {t('portfolio.manual.name')}
          <input value={form.name} onChange={set('name')} placeholder="Intel" />
        </label>
        <label>
          {t('portfolio.manual.currency')}
          <input
            required
            className="narrow"
            value={form.currency}
            onChange={set('currency')}
            maxLength={CURRENCY_CODE_LENGTH}
          />
        </label>
        <label>
          {t('portfolio.manual.quantity')}
          <input required className="narrow" value={form.quantity} onChange={set('quantity')} placeholder="10" />
        </label>
        <label>
          {t('portfolio.manual.price')}
          <input
            required
            className="narrow"
            value={form.pricePerShare}
            onChange={set('pricePerShare')}
            placeholder="30.5"
          />
        </label>
        <label>
          {t('portfolio.manual.date')}
          <input required type="date" value={form.acquiredAt} onChange={set('acquiredAt')} />
        </label>
        <label>
          {t('portfolio.manual.broker')}
          <select
            value={form.broker}
            onChange={(event) => setForm((current) => ({ ...current, broker: event.target.value as 'F24' | 'T212' }))}
          >
            <option value="F24">{t('broker.F24')}</option>
            <option value="T212">{t('portfolio.manual.brokerT212')}</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>
          {t('portfolio.manual.submit')}
        </button>
        {error && <FormError>{error}</FormError>}
      </form>

      {f24Positions.length > 0 && (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>{t('portfolio.col.instrument')}</th>
                <th>{t('portfolio.col.quantity')}</th>
                <th>{t('portfolio.col.avgPrice')}</th>
                <th>{t('portfolio.col.price')}</th>
                <th>{t('portfolio.col.newPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {f24Positions.map((position) => (
                <tr key={position.id}>
                  <InstrumentCell ticker={position.ticker} name={position.name} />
                  <td className="num">{quantity(position.quantity)}</td>
                  <td className="num">{money(position.averagePrice, position.instrumentCurrency)}</td>
                  <td className="num">{money(position.currentPrice, position.instrumentCurrency)}</td>
                  <td>
                    <span className="inline-price">
                      <input
                        aria-label={t('portfolio.col.newPrice')}
                        value={prices[position.instrumentId] ?? ''}
                        onChange={(event) =>
                          setPrices((current) => ({ ...current, [position.instrumentId]: event.target.value }))
                        }
                        placeholder="35.20"
                      />
                      <button type="button" className="ghost" onClick={() => savePrice(position.instrumentId)}>
                        {t('common.save')}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {overview.manualLots.length > 0 && (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>{t('portfolio.col.purchase')}</th>
                <th>{t('portfolio.col.broker')}</th>
                <th>{t('portfolio.col.quantity')}</th>
                <th>{t('portfolio.manual.price')}</th>
                <th>{t('portfolio.col.date')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {overview.manualLots.map((lot) => (
                <tr key={lot.id}>
                  <InstrumentCell ticker={lot.ticker} name={lot.name} />
                  <td className="muted">{lot.broker}</td>
                  <td className="num">{quantity(lot.quantity)}</td>
                  <td className="num">{money(lot.pricePerShare, lot.currency)}</td>
                  <td className="num">{date(lot.acquiredAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeLot(lot.id)}
                      onBlur={() => setConfirmingLotId(null)}
                    >
                      {confirmingLotId === lot.id ? t('common.confirmDelete') : t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Section>
  )
}
