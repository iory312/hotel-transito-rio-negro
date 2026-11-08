export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatISODate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayISO(): string {
  const now = new Date()
  return formatISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return formatISODate(date)
}

export function addYears(iso: string, years: number): string {
  const date = parseISODate(iso)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return formatISODate(date)
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86400000)
}

export function eachDate(from: string, toExclusive: string): string[] {
  const dates: string[] = []
  let cursor = from
  while (cursor < toExclusive) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

export function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  return {
    start: formatISODate(new Date(Date.UTC(year, monthIndex, 1))),
    end: formatISODate(new Date(Date.UTC(year, monthIndex + 1, 1))),
  }
}

export function currentMonth(): { year: number; monthIndex: number } {
  const today = parseISODate(todayISO())
  return { year: today.getUTCFullYear(), monthIndex: today.getUTCMonth() }
}

export function shiftMonth(year: number, monthIndex: number, delta: number): { year: number; monthIndex: number } {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1))
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() }
}

export function formatMonth(year: number, monthIndex: number): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseISODate(iso))
}

export function weekdayShort(iso: string): string {
  const name = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(parseISODate(iso))
  return name.replace('.', '').slice(0, 3).toUpperCase()
}

export function dayNumber(iso: string): number {
  return parseISODate(iso).getUTCDate()
}

export function isWeekend(iso: string): boolean {
  const day = parseISODate(iso).getUTCDay()
  return day === 0 || day === 6
}

export function ageOnDate(birthDate: string, onDate: string): number {
  const birth = parseISODate(birthDate)
  const on = parseISODate(onDate)
  let age = on.getUTCFullYear() - birth.getUTCFullYear()
  const monthDelta = on.getUTCMonth() - birth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < birth.getUTCDate())) age -= 1
  return age
}
