import { describe, expect, it } from 'vitest'
import { closeOnOrBefore } from './price-series.js'

const series = [
  { day: '2024-01-02', close: '100' },
  { day: '2024-01-03', close: '101' },
  { day: '2024-01-05', close: '103' },
]

describe('closeOnOrBefore', () => {
  it('returns the close of the day itself, else the last earlier one, else null', () => {
    const lookup = closeOnOrBefore(series)
    expect(lookup('2024-01-03')?.toNumber()).toBe(101)
    expect(lookup('2024-01-04')?.toNumber()).toBe(101)
    expect(lookup('2024-02-01')?.toNumber()).toBe(103)
    expect(lookup('2024-01-01')).toBeNull()
    expect(closeOnOrBefore([])('2024-01-01')).toBeNull()
  })
})
