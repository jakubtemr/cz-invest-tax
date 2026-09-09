import { useLang } from './i18n/index.js'
import type { Notice, Severity } from './ui.js'

// The server sends warning codes with parameters; the sentence is built here, in the reader's
// language. An unknown code still shows something useful instead of vanishing.
export interface ServerWarning {
  readonly code: string
  readonly severity: string
  readonly params: Readonly<Record<string, string>>
}

function severityOf(value: string): Severity {
  return value === 'info' || value === 'error' ? value : 'warn'
}

export function useNotices(warnings: readonly ServerWarning[]): Notice[] {
  const { tDynamic } = useLang()
  return warnings.map((warning, index) => ({
    key: `${warning.code}-${index}`,
    severity: severityOf(warning.severity),
    text: tDynamic(`warn.${warning.code}`, warning.params),
  }))
}
