import { describe, expect, it } from 'vitest'
import { countryFromIsin, isCountryCode, UNKNOWN_COUNTRY } from './country.js'

describe('countryFromIsin', () => {
  it('takes the country from the ISIN prefix', () => {
    expect(countryFromIsin('US0378331005')).toBe('US')
    expect(countryFromIsin('DE0007164600')).toBe('DE')
    expect(countryFromIsin('IE00B4L5Y983')).toBe('IE')
  })

  it('normalises case and surrounding whitespace', () => {
    expect(countryFromIsin('  us0378331005 ')).toBe('US')
  })

  it('supranational depository prefixes are not countries', () => {
    expect(countryFromIsin('XS1234567890')).toBe(UNKNOWN_COUNTRY)
  })

  it('a missing or malformed ISIN yields UNKNOWN', () => {
    expect(countryFromIsin(null)).toBe(UNKNOWN_COUNTRY)
    expect(countryFromIsin(undefined)).toBe(UNKNOWN_COUNTRY)
    expect(countryFromIsin('')).toBe(UNKNOWN_COUNTRY)
    expect(countryFromIsin('US03783')).toBe(UNKNOWN_COUNTRY)
    expect(countryFromIsin('0S0378331005')).toBe(UNKNOWN_COUNTRY)
  })
})

describe('isCountryCode', () => {
  it('accepts two uppercase letters that are not a depository prefix', () => {
    expect(isCountryCode('US')).toBe(true)
    expect(isCountryCode('XS')).toBe(false)
    expect(isCountryCode('us')).toBe(false)
    expect(isCountryCode('USA')).toBe(false)
  })
})
