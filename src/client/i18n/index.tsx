import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { cs, type MessageKey } from './cs.js'
import { en } from './en.js'

export type Lang = 'cs' | 'en'

// Typed loosely here on purpose: en.ts is still checked against Dictionary where it is declared,
// so key parity is enforced - this map only has to answer a key assembled at runtime.
const DICTIONARIES: Record<Lang, Readonly<Record<string, string>>> = { cs, en }
const LOCALES: Record<Lang, string> = { cs: 'cs-CZ', en: 'en-GB' }
const STORAGE_KEY = 'invest.lang'
const DEFAULT_LANG: Lang = 'cs'

export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string

// Some keys are assembled at runtime from a value the server chose - a warning code, a broker, a
// sync phase. The compiler cannot check those, so they come through their own door rather than
// through a cast on the strict one; an unknown key renders as itself.
export type TranslateDynamic = (key: string, params?: Readonly<Record<string, string | number>>) => string

interface LangValue {
  readonly lang: Lang
  readonly locale: string
  readonly setLang: (lang: Lang) => void
  readonly t: Translate
  readonly tDynamic: TranslateDynamic
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
  const lookup = useCallback(
    (key: string, params?: Readonly<Record<string, string | number>>) =>
      interpolate(DICTIONARIES[lang][key] ?? key, params),
    [lang],
  )

  const value = useMemo(() => ({ lang, locale: LOCALES[lang], setLang, t: lookup, tDynamic: lookup }), [lang, lookup])
  return <LangContext value={value}>{children}</LangContext>
}

export function useLang(): LangValue {
  const value = useContext(LangContext)
  if (!value) throw new Error('useLang used outside LangProvider')
  return value
}
