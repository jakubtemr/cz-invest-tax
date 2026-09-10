// The decisive date for tax purposes is the calendar day in Czechia, not the UTC timestamp.
// A US after-hours fill on 31 Dec 23:30 UTC is already 1 Jan in Prague - a different year and
// a different CNB rate. Shared by the server (tax math) and the client (countdowns).

const MS_PER_DAY = 24 * 60 * 60 * 1000

const PRAGUE_DAY_FORMAT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function pragueDay(date: Date): string {
  return PRAGUE_DAY_FORMAT.format(date)
}

export function pragueYear(date: Date): number {
  return Number(pragueDay(date).slice(0, 4))
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

// A period counted in years ends on the day with the same number (Civil Code s. 605);
// 29 Feb with no counterpart collapses to 28 Feb.
export function addYearsToDay(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const targetYear = y + years
  if (m === 2 && d === 29 && !isLeapYear(targetYear)) {
    return `${targetYear}-02-28`
  }
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function nextDay(day: string): string {
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

// Whole calendar days from today (Prague) to the given day - a countdown that does not drift
// around midnight the way a raw timestamp difference does.
export function daysFromToday(day: string, today: Date = new Date()): number {
  const target = new Date(`${day}T00:00:00Z`).getTime()
  const start = new Date(`${pragueDay(today)}T00:00:00Z`).getTime()
  return Math.round((target - start) / MS_PER_DAY)
}

// Whole days between two ISO days, positive when `to` is later.
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}
