import { AppError } from '../errors.js'

// Tax constants keyed by year. Rates and limits change every January, so an unknown year is an
// error rather than a silent fallback to the last known one: a wrong number the user believes is
// worse than a message saying the year is not supported yet.
//
// Every value carries its source. See docs/TAX.md for what the app does and does not compute.

export interface TreatyWithholding {
  // Maximum rate the source state may withhold on portfolio dividends under the treaty with
  // Czechia. Anything above it is refundable from the source state, not creditable here.
  readonly rate: number
  readonly source: string
}

export interface TaxYearConstants {
  readonly year: number
  // s. 4(1)(w): total sale proceeds up to this amount are exempt for the whole year.
  readonly saleExemptionLimitCzk: number
  // s. 4(3): cap on income exempt under the time test. In force for 2025 only - the 2026 amendment
  // dropped it for securities and business shares and kept it for crypto-assets, which this app
  // does not track. null in every other year.
  readonly exemptProceedsCapCzk: number | null
  readonly baseRate: number
  readonly topRate: number
  // 36x the average wage; income above it is taxed at topRate (s. 16a).
  readonly topRateThresholdCzk: number
  readonly treatyWithholding: Readonly<Record<string, TreatyWithholding>>
}

const SALE_EXEMPTION_LIMIT_CZK = 100_000
const EXEMPT_PROCEEDS_CAP_CZK = 40_000_000
// The cap on exempt securities income lived for exactly one year.
const EXEMPT_PROCEEDS_CAP_YEAR = 2025
const BASE_RATE = 0.15
const TOP_RATE = 0.23

// Treaty caps on portfolio dividends (a small shareholding, not a participation), cross-checked
// against the treaty overview KODAP publishes. The reference is the Czech promulgation in the
// Collection of Laws. Verify against the current text before filing: treaties get amended, and
// this table covers the countries a European retail portfolio usually touches, not all of them.
const TREATY_WITHHOLDING: Readonly<Record<string, TreatyWithholding>> = {
  AT: { rate: 0.1, source: 'Treaty 31/2007 Coll. i.t., Art. 10(2)(b)' },
  AU: { rate: 0.15, source: 'Treaty 5/1996 Coll., Art. 10(2)' },
  BE: { rate: 0.15, source: 'Treaty 95/2000 Coll. i.t., Art. 10(2)(b)' },
  CA: { rate: 0.15, source: 'Treaty 83/2002 Coll. i.t., Art. 10(2)(b)' },
  CH: { rate: 0.15, source: 'Treaty 281/1996 Coll., Art. 10(2)(b)' },
  DE: { rate: 0.15, source: 'Treaty 18/1984 Coll., Art. 10(2)(b)' },
  DK: { rate: 0.15, source: 'Treaty 14/2013 Coll. i.t., Art. 10(2)(b)' },
  ES: { rate: 0.15, source: 'Treaty 23/1982 Coll., Art. 10(2)(b)' },
  FI: { rate: 0.15, source: 'Treaty 43/1996 Coll., Art. 10(2)(b)' },
  FR: { rate: 0.1, source: 'Treaty 79/2005 Coll. i.t., Art. 10(2)' },
  // Ordinary UK dividends carry no withholding at all, so the cap rarely bites - but a REIT's
  // property income distribution does suffer 20 %, and that is exactly when the cap has to be here.
  GB: { rate: 0.15, source: 'Treaty 89/1992 Coll., Art. 10(2)(b)' },
  IE: { rate: 0.15, source: 'Treaty 163/1996 Coll., Art. 10(2)(b)' },
  IT: { rate: 0.15, source: 'Treaty 17/1985 Coll., Art. 10(2)(b)' },
  JP: { rate: 0.15, source: 'Treaty 46/1979 Coll., Art. 10(2)' },
  LU: { rate: 0.1, source: 'Treaty 51/2014 Coll. i.t., Art. 10(2)(b)' },
  NL: { rate: 0.1, source: 'Treaty 138/1974 Coll., Art. 10(2)(b)' },
  NO: { rate: 0.15, source: 'Treaty 121/2005 Coll. i.t., Art. 10(2)(b)' },
  PL: { rate: 0.05, source: 'Treaty 102/2012 Coll. i.t., Art. 10(2)(b)' },
  SE: { rate: 0.1, source: 'Treaty 9/1981 Coll., Art. 10(2)(b)' },
  SK: { rate: 0.15, source: 'Treaty 100/2003 Coll. i.t., Art. 10(2)(b)' },
  // Not a treaty: Czechia does not recognise Taiwan as a state, so the same relief is granted by
  // a domestic act instead. Relevant to anyone holding a Taiwanese ADR.
  TW: { rate: 0.1, source: 'Act 45/2020 Coll., s. 10(2)' },
  US: { rate: 0.15, source: 'Treaty 32/1994 Coll., Art. 10(2)(b)' },
}

// The 23 % threshold is 36x the average wage from 2024 on; 2021 to 2023 used 48x.
// 2021: 48 x 35 441, 2022: 48 x 38 911, 2023: 48 x 40 324,
// 2024: 36 x 43 967, 2025: 36 x 46 557, 2026: 36 x 48 967 (average wage per CSSZ).
const THRESHOLDS: Readonly<Record<number, number>> = {
  2021: 1_701_168,
  2022: 1_867_728,
  2023: 1_935_552,
  2024: 1_582_812,
  2025: 1_676_052,
  2026: 1_762_812,
}

function yearConstants(year: number, topRateThresholdCzk: number): TaxYearConstants {
  return {
    year,
    saleExemptionLimitCzk: SALE_EXEMPTION_LIMIT_CZK,
    exemptProceedsCapCzk: year === EXEMPT_PROCEEDS_CAP_YEAR ? EXEMPT_PROCEEDS_CAP_CZK : null,
    baseRate: BASE_RATE,
    topRate: TOP_RATE,
    topRateThresholdCzk,
    treatyWithholding: TREATY_WITHHOLDING,
  }
}

const TAX_YEARS: Readonly<Record<number, TaxYearConstants>> = Object.fromEntries(
  Object.entries(THRESHOLDS).map(([year, threshold]) => [year, yearConstants(Number(year), threshold)]),
)

export const SUPPORTED_TAX_YEARS: readonly number[] = Object.keys(TAX_YEARS)
  .map(Number)
  .sort((a, b) => a - b)

export function taxConstants(year: number): TaxYearConstants {
  const constants = TAX_YEARS[year]
  if (!constants) {
    throw new AppError(
      `No tax constants for year ${year} (supported: ${SUPPORTED_TAX_YEARS.join(', ')})`,
      'TAX_YEAR_UNSUPPORTED',
    )
  }
  return constants
}
