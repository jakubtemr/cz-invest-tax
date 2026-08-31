import { describe, expect, it } from 'vitest'
import { SUPPORTED_TAX_YEARS, taxConstants } from './constants.js'

describe('taxConstants', () => {
  it('throws instead of silently reusing another year', () => {
    expect(() => taxConstants(1999)).toThrow(expect.objectContaining({ code: 'TAX_YEAR_UNSUPPORTED' }))
  })

  it('names the supported years in the error so the message is actionable', () => {
    expect(() => taxConstants(2099)).toThrow(/2021/)
  })

  it('exposes the supported years in ascending order', () => {
    expect(SUPPORTED_TAX_YEARS).toEqual([...SUPPORTED_TAX_YEARS].sort((a, b) => a - b))
    expect(SUPPORTED_TAX_YEARS.length).toBeGreaterThan(0)
  })

  it('the 48x threshold before 2024 is higher than the 36x one after', () => {
    expect(taxConstants(2023).topRateThresholdCzk).toBeGreaterThan(taxConstants(2024).topRateThresholdCzk)
  })

  it('the 40M exemption cap applies to 2025 alone', () => {
    // Introduced for 2025, then dropped for securities again for 2026 (it survives only for crypto)
    expect(taxConstants(2024).exemptProceedsCapCzk).toBeNull()
    expect(taxConstants(2025).exemptProceedsCapCzk).toBe(40_000_000)
    expect(taxConstants(2026).exemptProceedsCapCzk).toBeNull()
  })

  it('the top-rate threshold changes per year', () => {
    expect(taxConstants(2025).topRateThresholdCzk).not.toBe(taxConstants(2026).topRateThresholdCzk)
  })

  it('every treaty rate is a share between zero and one and cites a source', () => {
    for (const [country, treaty] of Object.entries(taxConstants(2026).treatyWithholding)) {
      expect(country).toMatch(/^[A-Z]{2}$/)
      expect(treaty.rate).toBeGreaterThanOrEqual(0)
      expect(treaty.rate).toBeLessThanOrEqual(1)
      expect(treaty.source.length).toBeGreaterThan(10)
    }
  })
})
