import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { cs, type Dictionary, type MessageKey } from './cs.js'
import { en } from './en.js'

export type Lang = 'cs' | 'en'

const DICTIONARIES: Record<Lang, Dictionary> = { cs, en }
const LOCALES: Record<Lang, string> = { cs: 'cs-CZ', en: 'en-GB' }
const STORAGE_KEY = 'invest.lang'
const DEFAULT_LANG: Lang = 'cs'

export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string

interface LangValue {
  readonly lang: Lang
  readonly locale: string
  readonly setLang: (lang: Lang) => void
  readonly t: Translate
}

const LangContext = createContext<LangValue | null>(null)

function stored(): Lang {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'cs' || value === 'en' ? value : DEFAULT_LANG
}

// {name} placeholders only - anything richer belongs in a component, not in a dictionary string.
function interpolate(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return template
  return template.replaceAll(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole))
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(stored)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  // A missing key falls back to the key itself: a new warning code from the server must not blow
  // up the screen, and the raw code is still readable enough to act on.
  const t = useCallback<Translate>((key, params) => interpolate(DICTIONARIES[lang][key] ?? key, params), [lang])

  const value = useMemo(() => ({ lang, locale: LOCALES[lang], setLang, t }), [lang, t])
  return <LangContext value={value}>{children}</LangContext>
}

export function useLang(): LangValue {
  const value = useContext(LangContext)
  if (!value) throw new Error('useLang used outside LangProvider')
  return value
}
