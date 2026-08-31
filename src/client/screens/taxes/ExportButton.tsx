import { useState } from 'react'
import { api, errorText } from '../../api.js'
import { useLang } from '../../i18n/index.js'
import { FormError } from '../../ui.js'

// The CSV is generated on the server from the same numbers the table shows, then handed to the
// browser as a blob - no library, no second formatting path that could drift from the screen.
export function ExportButton({ kind, year }: { kind: 'sales' | 'dividends'; year: number }) {
  const { t } = useLang()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function download(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const csv = kind === 'sales' ? await api.tax.exportSales({ year }) : await api.tax.exportDividends({ year })
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${kind}-${year}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="export-row">
      <button type="button" className="ghost" onClick={download} disabled={busy}>
        {t('common.export')}
      </button>
      {error && <FormError>{error}</FormError>}
    </div>
  )
}
