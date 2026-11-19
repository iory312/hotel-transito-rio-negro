import { addDays, diffDays, isISODate } from '@/lib/dates.ts'
import { buildBill, findOverlap, nightsBetween } from '@/lib/domain.ts'
import { moneyTotal, sumMoney } from '@/lib/money.ts'
import type {
  BlockKind,
  PaymentStanding,
  Reservation,
  ReservationStatus,
  Room,
  RoomCategory,
  SaveStayInput,
  Stay,
} from '@/lib/types.ts'

export type UhToday = 'livre' | 'limpeza' | 'bloqueado' | 'hospedado' | 'saida' | 'chegada' | 'reservado' | 'pre_reserva' | 'troca'

export interface Placement {
  roomId: string
  checkIn: string
  checkOut: string
}

export type ReservationSort = 'checkIn' | 'guest' | 'room' | 'status' | 'total'

const STATUS_ORDER: ReservationStatus[] = ['pre_reserva', 'reservada', 'ocupada', 'checkout', 'cancelada', 'bloqueado']

const GUEST_STATUSES = new Set<ReservationStatus>(['pre_reserva', 'reservada', 'ocupada', 'checkout', 'cancelada'])

export function paymentStanding(input: { ready: boolean; total: number; paid: number }): PaymentStanding {
  if (!input.ready) return input.paid > 0 ? 'parcial' : 'pendente'
  if (input.paid <= 0 && input.total > 0) return 'pendente'
  if (input.paid + 0.001 < input.total) return input.paid > 0 ? 'parcial' : 'pendente'
  return 'pago'
}

export function occupantCount(titularName: string, dependents: { fullName: string }[]): number {
  const titular = titularName.trim() ? 1 : 0
  const family = dependents.filter((dependent) => dependent.fullName.trim().length > 0).length
  return titular + family
}

export function capacityWarning(people: number, capacity: number | null): string | null {
  if (capacity === null || people <= capacity) return null
  return `A UH comporta até ${capacity} pessoa(s) e esta reserva tem ${people}.`
}

export function nightsInside(checkIn: string, checkOut: string, from: string, toExclusive: string): number {
  if (!isISODate(checkIn) || !isISODate(checkOut) || !isISODate(from) || !isISODate(toExclusive)) return 0
  const start = checkIn > from ? checkIn : from
  const end = checkOut < toExclusive ? checkOut : toExclusive
  if (end <= start) return 0
  return diffDays(start, end)
}

export function categoryIdForSort(sortOrder: number, categories: RoomCategory[]): string | null {
  const name = sortOrder <= 5 ? 'Apartamento oficial' : sortOrder <= 10 ? 'Apartamento praça' : 'Suíte'
  return categories.find((category) => category.name === name)?.id ?? categories[0]?.id ?? null
}

export function uhToday(room: Room, stays: Stay[], date: string): UhToday {
  const covers = stays.filter(
    (stay) => stay.roomId === room.id && stay.status !== 'cancelada' && stay.checkIn <= date && stay.checkOut > date,
  )
  if (covers.some((stay) => stay.status === 'bloqueado')) return 'bloqueado'
  if (covers.some((stay) => stay.status === 'ocupada')) return 'hospedado'
  const leaving = stays.some((stay) => stay.roomId === room.id && stay.status === 'ocupada' && stay.checkOut === date)
  const arriving = covers.some(
    (stay) => (stay.status === 'pre_reserva' || stay.status === 'reservada') && stay.checkIn === date,
  )
  if (leaving && arriving) return 'troca'
  if (leaving) return 'saida'
  const hold = covers.find((stay) => stay.status === 'pre_reserva' || stay.status === 'reservada')
  if (hold?.status === 'pre_reserva') return hold.checkIn === date ? 'chegada' : 'pre_reserva'
  if (hold?.status === 'reservada') return hold.checkIn === date ? 'chegada' : 'reservado'
  if (room.housekeeping === 'limpeza') return 'limpeza'
  return 'livre'
}

export function uhCaption(roomId: string, state: UhToday, stays: Stay[], date: string): string {
  if (state === 'bloqueado') {
    const block = stays.find(
      (stay) => stay.roomId === roomId && stay.status === 'bloqueado' && stay.checkIn <= date && stay.checkOut > date,
    )
    return block?.blockReason ?? ''
  }
  if (state === 'hospedado') {
    return stays.find((stay) => stay.roomId === roomId && stay.status === 'ocupada' && stay.checkIn <= date && stay.checkOut > date)?.guest?.fullName ?? ''
  }
  if (state === 'saida' || state === 'troca') {
    const leaving = stays.find((stay) => stay.roomId === roomId && stay.status === 'ocupada' && stay.checkOut === date)
    const arriving = stays.find(
      (stay) =>
        stay.roomId === roomId &&
        (stay.status === 'pre_reserva' || stay.status === 'reservada') &&
        stay.checkIn === date,
    )
    if (state === 'troca') return [leaving?.guest?.fullName, arriving?.guest?.fullName].filter(Boolean).join(' · ')
    return leaving?.guest?.fullName ?? ''
  }
  if (state === 'chegada' || state === 'reservado' || state === 'pre_reserva') {
    return (
      stays.find(
        (stay) =>
          stay.roomId === roomId &&
          (stay.status === 'pre_reserva' || stay.status === 'reservada') &&
          stay.checkIn <= date &&
          stay.checkOut > date,
      )?.guest?.fullName ?? ''
    )
  }
  return ''
}

export interface TodayBoard {
  arrivals: Stay[]
  departures: Stay[]
  inHouse: Stay[]
  free: Room[]
  cleaning: Room[]
  blocked: Room[]
  rooms: { room: Room; state: UhToday }[]
}

export function todayBoard(rooms: Room[], stays: Stay[], date: string, movement: { checkIns: Stay[]; checkOuts: Stay[]; inHouse: Stay[] }): TodayBoard {
  const active = rooms.filter((room) => room.active)
  const rows = active.map((room) => ({ room, state: uhToday(room, stays, date) }))
  return {
    arrivals: [...movement.checkIns].sort(byRoom),
    departures: [...movement.checkOuts].sort(byRoom),
    inHouse: [...movement.inHouse].sort(byRoom),
    free: rows.filter((row) => row.state === 'livre').map((row) => row.room),
    cleaning: active.filter((room) => room.housekeeping === 'limpeza'),
    blocked: rows.filter((row) => row.state === 'bloqueado').map((row) => row.room),
    rooms: rows,
  }
}

function byRoom(a: Stay, b: Stay): number {
  return a.roomNumber.localeCompare(b.roomNumber, 'pt-BR')
}

export function moveStay(input: {
  checkIn: string
  checkOut: string
  roomIndex: number
  rooms: { id: string }[]
  grabDayIndex: number
  grabRoomIndex: number
  dropDayIndex: number
  dropRoomIndex: number
}): Placement | null {
  const { rooms } = input
  if (rooms.length === 0) return null
  if (input.roomIndex < 0 || input.roomIndex >= rooms.length) return null
  if (input.grabDayIndex < 0 || input.dropDayIndex < 0 || input.grabRoomIndex < 0 || input.dropRoomIndex < 0) return null
  const nextRoom = input.roomIndex + (input.dropRoomIndex - input.grabRoomIndex)
  if (nextRoom < 0 || nextRoom >= rooms.length) return null
  const dayDelta = input.dropDayIndex - input.grabDayIndex
  const checkIn = addDays(input.checkIn, dayDelta)
  const checkOut = addDays(input.checkOut, dayDelta)
  if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) return null
  const room = rooms[nextRoom]
  if (!room) return null
  return { roomId: room.id, checkIn, checkOut }
}

export function resizeStay(input: {
  checkIn: string
  checkOut: string
  roomId: string
  edge: 'start' | 'end'
  dropDayIndex: number
  days: string[]
}): Placement | null {
  const day = input.days[input.dropDayIndex]
  if (!day) return null
  const checkIn = input.edge === 'start' ? day : input.checkIn
  const checkOut = input.edge === 'end' ? addDays(day, 1) : input.checkOut
  if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) return null
  if (diffDays(checkIn, checkOut) > 366) return null
  return { roomId: input.roomId, checkIn, checkOut }
}

export function placementProblem(input: {
  id?: string
  status?: ReservationStatus
  roomId: string
  checkIn: string
  checkOut: string
  rooms: { id: string; active: boolean }[]
  reservations: Pick<Reservation, 'id' | 'roomId' | 'checkIn' | 'checkOut' | 'status'>[]
}): string | null {
  if (input.status === 'checkout' || input.status === 'cancelada') return 'Reserva encerrada não pode ser alterada.'
  if (!isISODate(input.checkIn) || !isISODate(input.checkOut) || input.checkOut <= input.checkIn) {
    return 'A saída deve ser posterior à entrada.'
  }
  if (nightsBetween(input.checkIn, input.checkOut) > 366) return 'O período não pode passar de 366 noites.'
  const room = input.rooms.find((item) => item.id === input.roomId)
  if (!room || !room.active) return 'Quarto inativo ou indisponível.'
  if (findOverlap({ id: input.id, roomId: input.roomId, checkIn: input.checkIn, checkOut: input.checkOut }, input.reservations)) {
    return 'Este quarto já está ocupado, reservado ou bloqueado no período.'
  }
  return null
}

export function samePlacement(stay: Pick<Stay, 'roomId' | 'checkIn' | 'checkOut'>, placement: Placement): boolean {
  return stay.roomId === placement.roomId && stay.checkIn === placement.checkIn && stay.checkOut === placement.checkOut
}

export function stayToInput(stay: Stay, patch?: Partial<Pick<SaveStayInput, 'roomId' | 'checkIn' | 'checkOut'>>): SaveStayInput {
  const kind = stay.status === 'bloqueado' ? 'bloqueio' : 'hospedagem'
  return {
    id: stay.id,
    roomId: patch?.roomId ?? stay.roomId,
    checkIn: patch?.checkIn ?? stay.checkIn,
    checkOut: patch?.checkOut ?? stay.checkOut,
    dailyRate: kind === 'bloqueio' ? 0 : stay.dailyRate,
    notes: stay.notes,
    kind,
    blockReason: stay.blockReason,
    blockKind: stay.blockKind === '' ? undefined : stay.blockKind,
    guest: stay.guest
      ? {
          id: stay.guest.id,
          fullName: stay.guest.fullName,
          rank: stay.guest.rank,
          nip: stay.guest.nip,
          om: stay.guest.om,
          phone: stay.guest.phone,
          notes: stay.guest.notes,
        }
      : null,
    dependents: stay.dependents.map((dependent) => ({ fullName: dependent.fullName, birthDate: dependent.birthDate })),
  }
}

export function filterReservations(
  stays: Stay[],
  input: {
    query: string
    statuses: ReservationStatus[]
    from: string
    toExclusive: string
    sort: ReservationSort
    direction: 'asc' | 'desc'
    exemptionAge: number
  },
): Stay[] {
  const query = input.query.trim().toLocaleLowerCase('pt-BR').slice(0, 60)
  const queryDigits = query.replace(/\D/g, '')
  const allowed = input.statuses.length > 0 ? new Set(input.statuses) : GUEST_STATUSES
  const period = isISODate(input.from) && isISODate(input.toExclusive) && input.toExclusive > input.from
  const rows = stays.filter((stay) => {
    if (stay.status === 'bloqueado' || !allowed.has(stay.status)) return false
    if (period && !(stay.checkIn < input.toExclusive && stay.checkOut > input.from)) return false
    if (!query) return true
    const name = stay.guest?.fullName.toLocaleLowerCase('pt-BR') ?? ''
    const nip = stay.guest?.nip.toLocaleLowerCase('pt-BR') ?? ''
    const room = stay.roomNumber.toLocaleLowerCase('pt-BR')
    const nipDigits = nip.replace(/\D/g, '')
    const roomDigits = room.replace(/^0+/, '')
    const roomHit = room.includes(query) || (queryDigits.length > 0 && queryDigits.length <= 3 && roomDigits === queryDigits.replace(/^0+/, ''))
    const nipHit = (query.length >= 2 && nip.includes(query)) || (queryDigits.length >= 4 && nipDigits.includes(queryDigits))
    const nameHit = query.length >= 2 && name.includes(query)
    return nameHit || roomHit || nipHit
  })
  const direction = input.direction === 'desc' ? -1 : 1
  rows.sort((a, b) => direction * compareStay(a, b, input.sort, input.exemptionAge))
  return rows
}

function compareStay(a: Stay, b: Stay, sort: ReservationSort, exemptionAge: number): number {
  if (sort === 'guest') return (a.guest?.fullName ?? '').localeCompare(b.guest?.fullName ?? '', 'pt-BR')
  if (sort === 'room') return a.roomNumber.localeCompare(b.roomNumber, 'pt-BR', { numeric: true })
  if (sort === 'status') return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  if (sort === 'total') return billTotal(a, exemptionAge) - billTotal(b, exemptionAge)
  return a.checkIn.localeCompare(b.checkIn) || a.roomNumber.localeCompare(b.roomNumber, 'pt-BR', { numeric: true })
}

export function billTotal(stay: Stay, exemptionAge: number): number {
  return buildBill({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    dailyRate: stay.status === 'bloqueado' ? 0 : stay.dailyRate,
    exemptionAge,
    titularName: stay.guest?.fullName ?? '',
    dependents: stay.dependents,
    payments: stay.payments,
  }).total
}

export function guestLedger(stays: Stay[], exemptionAge: number): { count: number; total: number; paid: number } {
  const rows = stays.filter((stay) => stay.status !== 'cancelada' && stay.status !== 'bloqueado')
  let total = 0
  let paid = 0
  for (const stay of rows) {
    const bill = buildBill({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      dailyRate: stay.dailyRate,
      exemptionAge,
      titularName: stay.guest?.fullName ?? '',
      dependents: stay.dependents,
      payments: stay.payments,
    })
    total += bill.total
    paid += bill.paid
  }
  return { count: rows.length, total: Math.round(total * 100) / 100, paid: Math.round(paid * 100) / 100 }
}

export interface RevenueRow {
  id: string
  roomNumber: string
  guest: string
  om: string
  status: ReservationStatus
  nights: number
  expected: number
  received: number
}

export function revenueReport(stays: Stay[], from: string, toExclusive: string, exemptionAge: number): { expected: number; received: number; rows: RevenueRow[] } {
  const rows: RevenueRow[] = []
  for (const stay of stays) {
    if (stay.status === 'bloqueado') continue
    const nights = stay.status === 'cancelada' ? 0 : nightsInside(stay.checkIn, stay.checkOut, from, toExclusive)
    const received = sumMoney(
      stay.payments.filter((payment) => payment.paidAt >= from && payment.paidAt < toExclusive).map((payment) => payment.amount),
    )
    if (nights === 0 && received === 0) continue
    const bill = buildBill({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      dailyRate: stay.dailyRate,
      exemptionAge,
      titularName: stay.guest?.fullName ?? '',
      dependents: stay.dependents,
      payments: [],
    })
    const expected = nights > 0 && bill.ready ? moneyTotal(stay.dailyRate, nights, bill.payers) : 0
    rows.push({
      id: stay.id,
      roomNumber: stay.roomNumber,
      guest: stay.guest?.fullName ?? '—',
      om: stay.guest?.om.trim() || 'Sem OM',
      status: stay.status,
      nights,
      expected,
      received,
    })
  }
  rows.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, 'pt-BR', { numeric: true }) || a.guest.localeCompare(b.guest, 'pt-BR'))
  return {
    expected: sumMoney(rows.map((row) => row.expected)),
    received: sumMoney(rows.map((row) => row.received)),
    rows,
  }
}

export interface OmRow {
  om: string
  guests: number
  stays: number
}

export function guestsByOm(stays: Stay[], from: string, toExclusive: string): OmRow[] {
  const groups = new Map<string, { guests: Set<string>; stays: number }>()
  for (const stay of stays) {
    if (stay.status === 'cancelada' || stay.status === 'bloqueado' || !stay.guest) continue
    if (!(stay.checkIn < toExclusive && stay.checkOut > from)) continue
    const om = stay.guest.om.trim() || 'Sem OM'
    const group = groups.get(om) ?? { guests: new Set<string>(), stays: 0 }
    group.guests.add(stay.guest.id)
    group.stays += 1
    groups.set(om, group)
  }
  return [...groups.entries()]
    .map(([om, group]) => ({ om, guests: group.guests.size, stays: group.stays }))
    .sort((a, b) => b.stays - a.stays || a.om.localeCompare(b.om, 'pt-BR'))
}

export function csvNumber(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

export function toCsv(header: string[], rows: string[][]): string {
  const escape = (value: string) => {
    const text = value.replaceAll('"', '""')
    return /[;"\n\r]/.test(text) ? `"${text}"` : text
  }
  const lines = [header, ...rows].map((row) => row.map((cell) => escape(cell)).join(';'))
  return `\uFEFF${lines.join('\r\n')}`
}

export function blockClass(kind: BlockKind | ''): string {
  if (kind === 'manutencao') return 'block-manutencao'
  if (kind === 'interdicao') return 'block-interdicao'
  if (kind === 'om') return 'block-om'
  return 'block-outro'
}
