export type ReservationStatus = 'reservada' | 'ocupada' | 'checkout' | 'cancelada' | 'bloqueado'
export type HousekeepingStatus = 'limpa' | 'limpeza'
export type PaymentMethod = 'dinheiro' | 'pix' | 'transferencia' | 'cartao'
export type StayKind = 'hospedagem' | 'bloqueio'

export interface Room {
  id: string
  number: string
  name: string
  housekeeping: HousekeepingStatus
  notes: string
  sortOrder: number
  active: boolean
}

export interface Guest {
  id: string
  fullName: string
  rank: string
  nip: string
  om: string
  phone: string
  notes: string
}

export interface Reservation {
  id: string
  roomId: string
  guestId: string | null
  checkIn: string
  checkOut: string
  dailyRate: number
  status: ReservationStatus
  notes: string
  blockReason: string
  createdAt: string
}

export interface Dependent {
  id: string
  reservationId: string
  fullName: string
  birthDate: string
}

export interface Payment {
  id: string
  reservationId: string
  amount: number
  method: PaymentMethod
  paidAt: string
  notes: string
  createdAt: string
}

export interface Settings {
  hotelName: string
  exemptionAge: number
}

export interface Stay {
  id: string
  roomId: string
  roomNumber: string
  roomName: string
  guest: Guest | null
  checkIn: string
  checkOut: string
  dailyRate: number
  status: ReservationStatus
  notes: string
  blockReason: string
  dependents: Dependent[]
  payments: Payment[]
  createdAt: string
}

export interface GuestDraft {
  id?: string
  fullName: string
  rank: string
  nip: string
  om: string
  phone: string
  notes: string
}

export interface DependentDraft {
  fullName: string
  birthDate: string
}

export interface SaveStayInput {
  id?: string
  roomId: string
  checkIn: string
  checkOut: string
  dailyRate: number | null
  notes: string
  kind: StayKind
  blockReason: string
  guest: GuestDraft | null
  dependents: DependentDraft[]
}

export interface DemoDatabase {
  rooms: Room[]
  guests: Guest[]
  reservations: Reservation[]
  dependents: Dependent[]
  payments: Payment[]
  settings: Settings
}

export interface PayerLine {
  name: string
  role: 'titular' | 'dependente'
  age: number | null
  pays: boolean
}

export interface Bill {
  ready: boolean
  pendingMessage: string | null
  nights: number
  dailyRate: number
  exemptionAge: number
  lines: PayerLine[]
  payers: number
  exemptDependents: number
  total: number
  paid: number
  balance: number
}

export interface DayMovement {
  checkIns: Stay[]
  checkOuts: Stay[]
  inHouse: Stay[]
}

export interface BreakfastPerson {
  roomNumber: string
  roomName: string
  name: string
  role: 'titular' | 'dependente'
  age: number | null
  pays: boolean
}

export interface Occupancy {
  nights: number
  roomNightsAvailable: number
  roomNightsOccupied: number
  roomNightsBlocked: number
  percent: number | null
}
