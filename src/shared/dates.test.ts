import { describe, expect, it } from 'vitest'
import { addYearsToDay, daysFromToday, nextDay, pragueDay, pragueYear } from './dates.js'

describe('pragueDay / pragueYear', () => {
  it('converts a late-UTC timestamp to the next Prague day', () => {
    expect(pragueDay(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01')
    expect(pragueYear(new Date('2025-12-31T23:30:00Z'))).toBe(2026)
  })
})

describe('addYearsToDay', () => {
  it('keeps the same calendar day', () => {
    expect(addYearsToDay('2022-01-10', 3)).toBe('2025-01-10')
  })

  it('Feb 29 with a non-leap target collapses to Feb 28 (century rule)', () => {
    expect(addYearsToDay('2096-02-29', 4)).toBe('2100-02-28')
  })

  it('Feb 29 with a leap target divisible by 400 stays Feb 29', () => {
    expect(addYearsToDay('2396-02-29', 4)).toBe('2400-02-29')
  })
})

describe('nextDay', () => {
  it('crosses a month boundary', () => {
    expect(nextDay('2025-01-31')).toBe('2025-02-01')
  })
})

describe('daysFromToday', () => {
  it('counts calendar days, not timestamp differences', () => {
    // 23:30 UTC is already the next day in Prague, so the countdown loses a day at that moment
    expect(daysFromToday('2026-03-10', new Date('2026-03-01T12:00:00Z'))).toBe(9)
    expect(daysFromToday('2026-03-10', new Date('2026-03-01T23:30:00Z'))).toBe(8)
  })

  it('is negative for a day already passed', () => {
    expect(daysFromToday('2026-02-27', new Date('2026-03-01T12:00:00Z'))).toBe(-2)
  })
})
