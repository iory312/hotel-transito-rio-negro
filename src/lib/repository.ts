import type { Guest, HousekeepingStatus, PaymentMethod, Room, SaveStayInput, Settings, Stay } from '@/lib/types.ts'

export interface GuestProfile {
  guest: Guest
  stays: Stay[]
}

export interface HotelRepository {
  readonly mode: 'demo' | 'remote'
  readonly host: string | null
  listRooms(): Promise<Room[]>
  updateRoom(id: string, patch: Partial<Pick<Room, 'number' | 'name' | 'notes' | 'housekeeping'>>): Promise<void>
  listGuests(search: string): Promise<Guest[]>
  getGuest(id: string): Promise<GuestProfile | null>
  saveGuest(guest: Guest): Promise<void>
  listReservations(from: string, to: string): Promise<Stay[]>
  getReservation(id: string): Promise<Stay | null>
  saveReservation(input: SaveStayInput): Promise<string>
  setStatus(id: string, status: 'ocupada' | 'checkout' | 'cancelada'): Promise<void>
  addPayment(input: { reservationId: string; amount: number; method: PaymentMethod; paidAt: string; notes: string }): Promise<void>
  deletePayment(id: string): Promise<void>
  getSettings(): Promise<Settings>
  updateSettings(exemptionAge: number): Promise<void>
  resetDemo?: () => Promise<void>
}

export type { HousekeepingStatus }
