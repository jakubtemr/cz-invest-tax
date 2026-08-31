import { useMemo } from 'react'
import { useLang } from './i18n/index.js'

const MONEY_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const
const MAX_QUANTITY_DIGITS = 6

export interface Formatters {
  // A monetary amount in an arbitrary currency; an unknown ISO code degrades to a plain suffix.
  money: (value: string | null | undefined, currency?: string | null) => string
  // Crowns, rounded to whole units unless the exact figure is what the row is about.
  czk: (value: string | null | undefined, exact?: boolean) => string
  quantity: (value: string) => string
  date: (value: Date | string) => string
  percent: (value: string | null) => string
}

export function useFormat(): Formatters {
  const { locale, t } = useLang()

  return useMemo(() => {
    const none = t('common.none')
    const czkRounded = new Intl.NumberFormat(locale, { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })
    const czkExact = new Intl.NumberFormat(locale, { style: 'currency', currency: 'CZK', ...MONEY_DIGITS })
    const plain = new Intl.NumberFormat(locale, MONEY_DIGITS)
    const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: MAX_QUANTITY_DIGITS })
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
    // Intl.NumberFormat is expensive to construct and a table renders dozens of money cells per
    // render, so the per-currency formatters are built once and kept for as long as the locale is.
    const byCurrency = new Map<string, Intl.NumberFormat | null>()
    const currencyFormat = (currency: string): Intl.NumberFormat | null => {
      if (!byCurrency.has(currency)) {
        try {
          byCurrency.set(currency, new Intl.NumberFormat(locale, { style: 'currency', currency, ...MONEY_DIGITS }))
        } catch {
          // An ISO code Intl does not know, remembered as a miss so it is not retried per cell.
          byCurrency.set(currency, null)
        }
      }
      return byCurrency.get(currency) ?? null
    }

    return {
      money: (value, currency) => {
        if (value == null) return none
        const amount = Number(value)
        if (!Number.isFinite(amount)) return value
        if (currency && /^[A-Z]{3}$/.test(currency)) {
          const formatter = currencyFormat(currency)
          if (formatter) return formatter.format(amount)
        }
        const formatted = plain.format(amount)
        return currency ? `${formatted} ${currency}` : formatted
      },
      czk: (value, exact = false) => {
        if (value == null) return none
        const amount = Number(value)
        if (!Number.isFinite(amount)) return value
        return exact ? czkExact.format(amount) : czkRounded.format(amount)
      },
      quantity: (value) => quantity.format(Number(value)),
      date: (value) => date.format(new Date(value)),
      percent: (value) => (value === null ? none : `${value} %`),
    }
  }, [locale, t])
}
