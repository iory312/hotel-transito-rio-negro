import type {
  Guest,
  GuestDependent,
  HousekeepingStatus,
  PaymentMethod,
  ReservationStatus,
  Room,
  RoomCategory,
  SaveGuestInput,
  SaveStayInput,
  Settings,
  Stay,
} from '@/lib/types.ts'

export interface GuestProfile {
  guest: Guest
  dependents: GuestDependent[]
  stays: Stay[]
}

export interface HotelRepository {
  readonly mode: 'demo' | 'remote'
  readonly host: string | null
  listRooms(options?: { includeInactive?: boolean }): Promise<Room[]>
  updateRoom(id: string, patch: Partial<Pick<Room, 'number' | 'name' | 'notes' | 'housekeeping' | 'active' | 'categoryId'>>): Promise<void>
  listCategories(): Promise<RoomCategory[]>
  saveCategory(input: { id?: string; name: string; capacity: number }): Promise<string>
  listGuests(search: string): Promise<Guest[]>
  getGuest(id: string): Promise<GuestProfile | null>
  saveGuest(input: SaveGuestInput): Promise<string>
  listReservations(from: string, to: string, options?: { includeCancelled?: boolean }): Promise<Stay[]>
  getReservation(id: string): Promise<Stay | null>
  saveReservation(input: SaveStayInput): Promise<string>
  setStatus(id: string, status: Extract<ReservationStatus, 'reservada' | 'ocupada' | 'checkout' | 'cancelada'>): Promise<void>
  cancelReservation(id: string, reason: string): Promise<void>
  addPayment(input: { reservationId: string; amount: number; method: PaymentMethod; paidAt: string; notes: string }): Promise<void>
  deletePayment(id: string): Promise<void>
  getSettings(): Promise<Settings>
  updateSettings(exemptionAge: number): Promise<void>
  resetDemo?: () => Promise<void>
}

export type { HousekeepingStatus }
