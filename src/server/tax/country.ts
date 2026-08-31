// Source state of a dividend, needed for the treaty cap and the credit. The first two characters
// of an ISIN are the code of the issuing national numbering agency, which is a good default and a
// bad certainty: an ADR on a German company carries a US ISIN, and an Irish-domiciled UCITS ETF
// distributes with an IE ISIN whatever it holds. Hence the manual override on the instrument.

export const UNKNOWN_COUNTRY = 'UNKNOWN'

// X-prefixed ISINs are supranational depositories (XS = Euroclear/Clearstream), not countries.
const ISIN_PREFIX = /^([A-Z]{2})[A-Z0-9]{9}\d$/

export function countryFromIsin(isin: string | null | undefined): string {
  const prefix = isin?.trim().toUpperCase().match(ISIN_PREFIX)?.[1]
  if (!prefix || prefix.startsWith('X')) return UNKNOWN_COUNTRY
  return prefix
}

export function isCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value) && !value.startsWith('X')
}
