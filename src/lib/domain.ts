import { addDays, addYears, ageOnDate, diffDays, eachDate, isISODate, todayISO } from '@/lib/dates.ts'
import { moneyTotal, sumMoney } from '@/lib/money.ts'
import type {
  Bill,
  BreakfastPerson,
  DayMovement,
  DependentDraft,
  GuestDraft,
  Occupancy,
  Reservation,
  ReservationStatus,
  SaveStayInput,
  Stay,
} from '@/lib/types.ts'

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  reservada: ['ocupada', 'cancelada'],
  ocupada: ['checkout', 'cancelada'],
  bloqueado: ['cancelada'],
  checkout: [],
  cancelada: [],
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) return 0
  return diffDays(checkIn, checkOut)
}

export function rangesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut
}

export function findOverlap(
  candidate: { id?: string; roomId: string; checkIn: string; checkOut: string },
  reservations: Reservation[],
): Reservation | null {
  return (
    reservations.find(
      (reservation) =>
        reservation.id !== candidate.id &&
        reservation.roomId === candidate.roomId &&
        reservation.status !== 'cancelada' &&
        rangesOverlap(candidate.checkIn, candidate.checkOut, reservation.checkIn, reservation.checkOut),
    ) ?? null
  )
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError('Transição de status não permitida')
  }
}

export function shouldMarkCleaning(from: ReservationStatus, to: ReservationStatus): boolean {
  return to === 'checkout' || (to === 'cancelada' && from === 'ocupada')
}

export function assertGuest(guest: GuestDraft): void {
  const name = guest.fullName.trim()
  const rank = guest.rank.trim()
  const nip = guest.nip.trim()
  if (name.length < 3 || rank.length < 2 || nip.length < 4) {
    throw new DomainError('Preencha nome, posto ou graduação e NIP do titular.')
  }
  if (
    name.length > 120 ||
    rank.length > 80 ||
    nip.length > 20 ||
    guest.om.trim().length > 160 ||
    guest.phone.trim().length > 40 ||
    guest.notes.length > 2000
  ) {
    throw new DomainError('Há campos fora do formato esperado.')
  }
}

export function assertBirthDate(value: string, today = todayISO()): void {
  if (!isISODate(value) || value > today || value < addYears(today, -120)) {
    throw new DomainError('Data de nascimento do dependente é inválida.')
  }
}

export function assertDependents(dependents: DependentDraft[], today = todayISO()): void {
  if (dependents.length > 12) throw new DomainError('Limite de 12 dependentes por reserva.')
  for (const dependent of dependents) {
    if (dependent.fullName.trim().length < 3 || !dependent.birthDate) {
      throw new DomainError('Dependente precisa de nome e data de nascimento.')
    }
    if (dependent.fullName.trim().length > 120) throw new DomainError('Há campos fora do formato esperado.')
    assertBirthDate(dependent.birthDate, today)
  }
}

export function assertExemptionAge(age: number): void {
  if (!Number.isInteger(age) || age < 0 || age > 25) {
    throw new DomainError('A idade de isenção deve ser um número inteiro entre 0 e 25.')
  }
}

export function assertRoomIdentity(number: string, name: string): void {
  const trimmedNumber = number.trim()
  const trimmedName = name.trim()
  if (trimmedNumber.length < 1 || trimmedNumber.length > 10 || trimmedName.length < 1 || trimmedName.length > 80) {
    throw new DomainError('Informe número e nome do quarto.')
  }
}

export function assertSave(input: SaveStayInput, existing: Reservation | null, reservations: Reservation[]): void {
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut) || input.checkOut <= input.checkIn) {
    throw new DomainError('A saída deve ser posterior à entrada.')
  }
  if (diffDays(input.checkIn, input.checkOut) > 366) {
    throw new DomainError('O período não pode passar de 366 noites.')
  }
  if (input.notes.length > 2000) throw new DomainError('Há campos fora do formato esperado.')
  if (existing && (existing.status === 'cancelada' || existing.status === 'checkout')) {
    throw new DomainError('Reserva encerrada não pode ser alterada.')
  }
  if (existing && (existing.status === 'bloqueado') !== (input.kind === 'bloqueio')) {
    throw new DomainError('Não é possível converter o tipo do registro.')
  }
  if (findOverlap({ id: existing?.id, roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut }, reservations)) {
    throw new DomainError('Este quarto já está ocupado, reservado ou bloqueado no período.')
  }
  if (input.kind === 'bloqueio') {
    if (input.blockReason.trim().length < 3) throw new DomainError('Informe o motivo do bloqueio.')
    if (input.dependents.length > 0) throw new DomainError('Bloqueio não possui dependentes.')
    return
  }
  if (input.dailyRate === null || input.dailyRate < 0 || input.dailyRate > 100000) {
    throw new DomainError('Informe a diária do período.')
  }
  if (!input.guest) throw new DomainError('Preencha nome, posto ou graduação e NIP do titular.')
  assertGuest(input.guest)
  assertDependents(input.dependents)
}

export function buildBill(input: {
  checkIn: string
  checkOut: string
  dailyRate: number | null
  exemptionAge: number
  titularName: string
  dependents: DependentDraft[]
  payments: { amount: number }[]
}): Bill {
  const nights = nightsBetween(input.checkIn, input.checkOut)
  const lines: Bill['lines'] = []
  if (input.titularName.trim()) {
    lines.push({ name: input.titularName.trim(), role: 'titular', age: null, pays: true })
  }
  for (const dependent of input.dependents) {
    const validBirth = isISODate(dependent.birthDate) && isISODate(input.checkIn)
    const age = validBirth ? ageOnDate(dependent.birthDate, input.checkIn) : null
    lines.push({
      name: dependent.fullName.trim() || 'Dependente',
      role: 'dependente',
      age,
      pays: age !== null && age > input.exemptionAge,
    })
  }
  const payers = lines.filter((line) => line.pays).length
  const exemptDependents = lines.filter((line) => line.role === 'dependente' && !line.pays && line.age !== null).length
  const paid = sumMoney(input.payments.map((payment) => payment.amount))
  const rate = input.dailyRate
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut) || input.checkOut <= input.checkIn) {
    return emptyBill(input.exemptionAge, lines, paid, 'Defina entrada e saída para calcular.')
  }
  if (rate === null) {
    return emptyBill(input.exemptionAge, lines, paid, 'Informe a diária para calcular.')
  }
  const total = moneyTotal(rate, nights, payers)
  return {
    ready: true,
    pendingMessage: null,
    nights,
    dailyRate: rate,
    exemptionAge: input.exemptionAge,
    lines,
    payers,
    exemptDependents,
    total,
    paid,
    balance: Math.round((total - paid) * 100) / 100,
  }
}

function emptyBill(exemptionAge: number, lines: Bill['lines'], paid: number, message: string): Bill {
  return {
    ready: false,
    pendingMessage: message,
    nights: 0,
    dailyRate: 0,
    exemptionAge,
    lines,
    payers: lines.filter((line) => line.pays).length,
    exemptDependents: 0,
    total: 0,
    paid,
    balance: 0,
  }
}

export function dayMovement(stays: Stay[], date: string): DayMovement {
  const active = stays.filter((stay) => stay.status !== 'cancelada' && stay.status !== 'bloqueado')
  return {
    checkIns: active.filter((stay) => stay.checkIn === date && (stay.status === 'reservada' || stay.status === 'ocupada')),
    checkOuts: active.filter((stay) => stay.checkOut === date && (stay.status === 'ocupada' || stay.status === 'checkout')),
    inHouse: active.filter((stay) => stay.status === 'ocupada' && stay.checkIn <= date && stay.checkOut > date),
  }
}

export function breakfastList(stays: Stay[], date: string, exemptionAge: number): BreakfastPerson[] {
  const overnight = stays.filter(
    (stay) =>
      (stay.status === 'ocupada' || stay.status === 'checkout') &&
      stay.checkIn < date &&
      stay.checkOut >= date &&
      stay.guest,
  )
  const people: BreakfastPerson[] = []
  for (const stay of overnight) {
    if (!stay.guest) continue
    people.push({
      roomNumber: stay.roomNumber,
      roomName: stay.roomName,
      name: stay.guest.fullName,
      role: 'titular',
      age: null,
      pays: true,
    })
    for (const dependent of stay.dependents) {
      const age = isISODate(dependent.birthDate) ? ageOnDate(dependent.birthDate, stay.checkIn) : null
      people.push({
        roomNumber: stay.roomNumber,
        roomName: stay.roomName,
        name: dependent.fullName,
        role: 'dependente',
        age,
        pays: age !== null && age > exemptionAge,
      })
    }
  }
  return people.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'))
}

export function occupancy(activeRooms: number, stays: Stay[], from: string, toExclusive: string): Occupancy {
  const days = eachDate(from, toExclusive)
  let roomNightsAvailable = 0
  let roomNightsOccupied = 0
  let roomNightsBlocked = 0
  for (const day of days) {
    const blocked = new Set(
      stays.filter((stay) => stay.status === 'bloqueado' && stay.checkIn <= day && stay.checkOut > day).map((stay) => stay.roomId),
    )
    const occupied = new Set(
      stays
        .filter(
          (stay) =>
            (stay.status === 'reservada' || stay.status === 'ocupada' || stay.status === 'checkout') &&
            stay.checkIn <= day &&
            stay.checkOut > day,
        )
        .map((stay) => stay.roomId),
    )
    const available = Math.max(0, activeRooms - blocked.size)
    roomNightsBlocked += blocked.size
    roomNightsAvailable += available
    roomNightsOccupied += occupied.size
  }
  return {
    nights: days.length,
    roomNightsAvailable,
    roomNightsOccupied,
    roomNightsBlocked,
    percent: roomNightsAvailable === 0 ? null : (roomNightsOccupied / roomNightsAvailable) * 100,
  }
}

export function blockGeometry(
  checkIn: string,
  checkOut: string,
  days: string[],
  dayWidth: number,
): { left: number; width: number } | null {
  if (days.length === 0) return null
  const visibleStart = days[0]
  const visibleEnd = addDays(days[days.length - 1], 1)
  const start = checkIn > visibleStart ? checkIn : visibleStart
  const end = checkOut < visibleEnd ? checkOut : visibleEnd
  if (start >= end) return null
  const startIndex = days.indexOf(start)
  if (startIndex < 0) return null
  const span = diffDays(start, end)
  return { left: startIndex * dayWidth, width: Math.max(dayWidth - 4, span * dayWidth - 4) }
}

export function peopleInHouse(stay: Stay): number {
  return (stay.guest ? 1 : 0) + stay.dependents.length
}

export function sanitizeSearch(value: string): string {
  return value.replace(/[%_,()*\\]/g, '').trim().slice(0, 60)
}
