import { type ChangeEvent, type SyntheticEvent, useState } from 'react'
import { api, errorText } from '../../api.js'
import { useLang } from '../../i18n/index.js'
import { FormError, Section } from '../../ui.js'

const EMPTY_TRANSFER_FORM = { fromTicker: '', toTicker: '', quantity: '' }

export function TransferForm({ onDone }: { onDone: () => void }) {
  const { t } = useLang()
  const [form, setForm] = useState(EMPTY_TRANSFER_FORM)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setNote(null)
    try {
      const result = await api.manual.transferRemainder({
        fromTicker: form.fromTicker.trim(),
        toTicker: form.toTicker.trim(),
        quantity: form.quantity.trim() || null,
      })
      setNote({ kind: 'ok', text: t('taxes.transfer.done', { quantity: result.moved, lots: result.createdLots }) })
      setForm(EMPTY_TRANSFER_FORM)
      onDone()
    } catch (err) {
      setNote({ kind: 'err', text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof typeof EMPTY_TRANSFER_FORM) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }))

  return (
    <Section title={t('taxes.transfer.title')} hint={t('taxes.transfer.hint')}>
      <form className="lot-form" onSubmit={submit}>
        <label>
          {t('taxes.transfer.from')}
          <input required value={form.fromTicker} onChange={set('fromTicker')} placeholder="HON_US_EQ" />
        </label>
        <label>
          {t('taxes.transfer.to')}
          <input required value={form.toTicker} onChange={set('toTicker')} placeholder="HONAV_US_EQ" />
        </label>
        <label>
          {t('taxes.transfer.quantity')}
          <input className="narrow" value={form.quantity} onChange={set('quantity')} />
        </label>
        <button type="submit" disabled={busy}>
          {t('taxes.transfer.submit')}
        </button>
        {note?.kind === 'err' && <FormError>{note.text}</FormError>}
        {note?.kind === 'ok' && <div className="sync-note ok">{note.text}</div>}
      </form>
    </Section>
  )
}
