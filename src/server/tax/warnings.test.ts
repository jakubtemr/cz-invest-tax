import { describe, expect, it } from 'vitest'
import { cs } from '../../client/i18n/cs.js'
import { en } from '../../client/i18n/en.js'
import { REPAIRABLE_CODES, type WarningCode, warn } from './warnings.js'

// The union is the contract between the domain and both dictionaries. Without this the client's
// `warn.${code}` lookup falls back to the raw code and a rename ships silently.
const ALL_CODES: readonly WarningCode[] = [
  'unmatchedSale',
  'currencyMismatch',
  'dividendGrossMissing',
  'withholdingNegative',
  'exemptOverCap',
  'treatyExceeded',
  'treatyUnknown',
  'domesticDividend',
  'creditResidual',
  'otherBasesUsed',
  'fxCurrencyUnquoted',
  'fxRateUnavailable',
  'itemDroppedNoRate',
  'reconcile.split',
  'reconcile.adjusted',
  'reconcile.closed',
  'reconcile.unexplained',
]

describe('warning codes', () => {
  it.each(ALL_CODES)('%s is translated in both languages', (code) => {
    expect(cs[`warn.${code}`]).toBeTruthy()
    expect(en[`warn.${code}`]).toBeTruthy()
  })

  it('every repairable code is a real code', () => {
    for (const code of REPAIRABLE_CODES) expect(ALL_CODES).toContain(code)
  })

  it('defaults to the warn severity and carries its parameters through', () => {
    expect(warn('treatyUnknown', { country: 'TW' })).toEqual({
      code: 'treatyUnknown',
      severity: 'warn',
      params: { country: 'TW' },
    })
  })
})
