// Warnings travel as a code plus parameters, never as a finished sentence: the domain layer must
// not pick a language, and the client renders them through the i18n dictionary.

export type WarningSeverity = 'info' | 'warn' | 'error'

// Every code the domain can emit. Typing it means a rename breaks the build instead of quietly
// shipping a raw code to the screen; warnings.test.ts checks both dictionaries carry all of them.
export type WarningCode =
  | 'unmatchedSale'
  | 'currencyMismatch'
  | 'dividendGrossMissing'
  | 'withholdingNegative'
  | 'exemptOverCap'
  | 'treatyExceeded'
  | 'treatyUnknown'
  | 'domesticDividend'
  | 'creditResidual'
  | 'otherBasesUsed'
  | 'fxCurrencyUnquoted'
  | 'fxRateUnavailable'
  | 'itemDroppedNoRate'
  | 'reconcile.split'
  | 'reconcile.adjusted'
  | 'reconcile.closed'
  | 'reconcile.unexplained'

// Codes whose cause the transfer tool on the Taxes screen can actually repair.
export const REPAIRABLE_CODES: readonly WarningCode[] = ['unmatchedSale', 'reconcile.unexplained']

export interface TaxWarning {
  readonly code: WarningCode
  readonly severity: WarningSeverity
  readonly params: Readonly<Record<string, string>>
}

export function warn(
  code: WarningCode,
  params: Readonly<Record<string, string>> = {},
  severity: WarningSeverity = 'warn',
): TaxWarning {
  return { code, severity, params }
}
