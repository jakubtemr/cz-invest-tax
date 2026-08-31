import { useState } from 'react'
import { api, errorText } from '../../api.js'
import { useLang } from '../../i18n/index.js'

const MAX_LENGTH = 7

// The ISIN prefix is only a default: an ADR carries the issuer's registry, not the state that
// actually taxed the dividend. Correcting it here is what makes the treaty cap trustworthy.
export function CountryCell({
  instrumentId,
  country,
  onChanged,
}: {
  instrumentId: number
  country: string
  onChanged: () => void
}) {
  const { t } = useLang()
  const [value, setValue] = useState(country)
  const [error, setError] = useState<string | null>(null)

  async function save(): Promise<void> {
    const next = value.trim().toUpperCase()
    if (next === country) return
    try {
      await api.manual.setCountry({ instrumentId, country: next })
      setError(null)
      onChanged()
    } catch (err) {
      setError(errorText(err))
      setValue(country)
    }
  }

  return (
    <td>
      <input
        className="country-input"
        aria-label={t('taxes.dividends.col.country')}
        title={error ?? t('taxes.dividends.countryHint')}
        maxLength={MAX_LENGTH}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
      />
    </td>
  )
}
