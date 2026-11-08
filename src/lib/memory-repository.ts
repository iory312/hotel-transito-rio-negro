import { isISODate, todayISO } from '@/lib/dates.ts'
import {
  assertExemptionAge,
  assertGuest,
  assertRoomIdentity,
  assertSave,
  assertTransition,
  DomainError,
  sanitizeSearch,
  shouldMarkCleaning,
} from '@/lib/domain.ts'
import type { GuestProfile, HotelRepository } from '@/lib/repository.ts'
import type { DemoDatabase, PaymentMethod, Reservation, Room, SaveStayInput, Stay } from '@/lib/types.ts'

const PAYMENT_METHODS = new Set<PaymentMethod>(['dinheiro', 'pix', 'transferencia', 'cartao'])

function clone<T>(value: T): T {
  return structuredClone(value)
}

function staysOf(db: DemoDatabase, reservations: Reservation[]): Stay[] {
  const rooms = new Map(db.rooms.map((room) => [room.id, room]))
  const guests = new Map(db.guests.map((guest) => [guest.id, guest]))
  return reservations
    .map((reservation) => {
      const room = rooms.get(reservation.roomId)
      return {
        ...reservation,
        roomNumber: room?.number ?? '—',
        roomName: room?.name ?? 'Quarto removido',
        guest: reservation.guestId ? (guests.get(reservation.guestId) ?? null) : null,
        dependents: db.dependents.filter((dependent) => dependent.reservationId === reservation.id),
        payments: db.payments.filter((payment) => payment.reservationId === reservation.id),
      }
    })
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.roomNumber.localeCompare(b.roomNumber, 'pt-BR'))
}

export function createMemoryRepository(
  initial: DemoDatabase,
  options?: { persist?: (db: DemoDatabase) => void; mode?: 'demo' | 'remote' },
): HotelRepository {
  let db = clone(initial)
  const persist = () => options?.persist?.(clone(db))

  function roomOrThrow(id: string): Room {
    const room = db.rooms.find((item) => item.id === id && item.active)
    if (!room) throw new DomainError('Quarto não encontrado.')
    return room
  }

  function reservationOrThrow(id: string): Reservation {
    const reservation = db.reservations.find((item) => item.id === id)
    if (!reservation) throw new DomainError('Reserva não encontrada.')
    return reservation
  }

  return {
    mode: options?.mode ?? 'demo',
    host: null,
    async listRooms() {
      return clone(db.rooms.filter((room) => room.active).sort((a, b) => a.sortOrder - b.sortOrder))
    },
    async updateRoom(id, patch) {
      const room = db.rooms.find((item) => item.id === id)
      if (!room) throw new DomainError('Quarto não encontrado.')
      const number = patch.number ?? room.number
      const name = patch.name ?? room.name
      if (patch.number !== undefined || patch.name !== undefined) assertRoomIdentity(number, name)
      if (patch.notes !== undefined && patch.notes.length > 500) throw new DomainError('Há campos fora do formato esperado.')
      if (patch.housekeeping && patch.housekeeping !== 'limpa' && patch.housekeeping !== 'limpeza') {
        throw new DomainError('Dados inválidos.')
      }
      const duplicate = db.rooms.find((item) => item.id !== id && item.number.trim() === number.trim())
      if (duplicate) throw new DomainError('Já existe quarto com este número.')
      room.number = number.trim()
      room.name = name.trim()
      if (patch.notes !== undefined) room.notes = patch.notes
      if (patch.housekeeping) room.housekeeping = patch.housekeeping
      persist()
    },
    async listGuests(search) {
      const query = sanitizeSearch(search).toLocaleLowerCase('pt-BR')
      return clone(
        db.guests
          .filter((guest) => {
            if (!query) return true
            const haystack = `${guest.fullName} ${guest.rank} ${guest.nip} ${guest.om}`.toLocaleLowerCase('pt-BR')
            return haystack.includes(query)
          })
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')),
      )
    },
    async getGuest(id): Promise<GuestProfile | null> {
      const guest = db.guests.find((item) => item.id === id)
      if (!guest) return null
      const reservations = db.reservations
        .filter((reservation) => reservation.guestId === id)
        .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
      return { guest: clone(guest), stays: staysOf(db, reservations) }
    },
    async saveGuest(guest) {
      assertGuest(guest)
      const current = db.guests.find((item) => item.id === guest.id)
      if (!current) throw new DomainError('Hóspede não encontrado.')
      const duplicate = db.guests.find((item) => item.id !== guest.id && item.nip.trim() === guest.nip.trim())
      if (duplicate) throw new DomainError('NIP já cadastrado para outro militar.')
      current.fullName = guest.fullName.trim()
      current.rank = guest.rank.trim()
      current.nip = guest.nip.trim()
      current.om = guest.om.trim()
      current.phone = guest.phone.trim()
      current.notes = guest.notes
      persist()
    },
    async listReservations(from, to) {
      const rows = db.reservations.filter(
        (reservation) => reservation.status !== 'cancelada' && reservation.checkIn < to && reservation.checkOut > from,
      )
      return staysOf(db, rows)
    },
    async getReservation(id) {
      const reservation = db.reservations.find((item) => item.id === id)
      if (!reservation) return null
      return staysOf(db, [reservation])[0] ?? null
    },
    async saveReservation(input: SaveStayInput) {
      const existing = input.id ? reservationOrThrow(input.id) : null
      roomOrThrow(input.roomId)
      assertSave(input, existing, db.reservations)
      const guestId = input.kind === 'hospedagem' ? upsertGuest(db, input.guest!) : null
      const id = existing?.id ?? crypto.randomUUID()
      const next: Reservation = {
        id,
        roomId: input.roomId,
        guestId,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        dailyRate: input.kind === 'bloqueio' ? 0 : (input.dailyRate ?? 0),
        status: existing?.status ?? (input.kind === 'bloqueio' ? 'bloqueado' : 'reservada'),
        notes: input.notes,
        blockReason: input.kind === 'bloqueio' ? input.blockReason.trim() : '',
        createdAt: existing?.createdAt ?? todayISO(),
      }
      if (existing) {
        const index = db.reservations.findIndex((item) => item.id === id)
        db.reservations[index] = next
        db.dependents = db.dependents.filter((dependent) => dependent.reservationId !== id)
      } else {
        db.reservations.push(next)
      }
      if (input.kind === 'hospedagem') {
        for (const dependent of input.dependents) {
          db.dependents.push({
            id: crypto.randomUUID(),
            reservationId: id,
            fullName: dependent.fullName.trim(),
            birthDate: dependent.birthDate,
          })
        }
      }
      persist()
      return id
    },
    async setStatus(id, status) {
      const reservation = reservationOrThrow(id)
      assertTransition(reservation.status, status)
      const previous = reservation.status
      reservation.status = status
      if (shouldMarkCleaning(previous, status)) {
        const room = db.rooms.find((item) => item.id === reservation.roomId)
        if (room) room.housekeeping = 'limpeza'
      }
      persist()
    },
    async addPayment(input) {
      const reservation = reservationOrThrow(input.reservationId)
      if (reservation.status === 'bloqueado' || reservation.status === 'cancelada') {
        throw new DomainError('Pagamento não se aplica a este registro.')
      }
      if (!PAYMENT_METHODS.has(input.method)) throw new DomainError('Forma de pagamento inválida.')
      if (!isISODate(input.paidAt) || input.amount <= 0 || input.amount > 1000000) {
        throw new DomainError('Informe um valor de pagamento válido.')
      }
      if (input.notes.length > 500) throw new DomainError('Há campos fora do formato esperado.')
      db.payments.push({
        id: crypto.randomUUID(),
        reservationId: input.reservationId,
        amount: Math.round(input.amount * 100) / 100,
        method: input.method,
        paidAt: input.paidAt,
        notes: input.notes,
        createdAt: todayISO(),
      })
      persist()
    },
    async deletePayment(id) {
      const before = db.payments.length
      db.payments = db.payments.filter((payment) => payment.id !== id)
      if (db.payments.length === before) throw new DomainError('Pagamento não se aplica a este registro.')
      persist()
    },
    async getSettings() {
      return clone(db.settings)
    },
    async updateSettings(exemptionAge) {
      assertExemptionAge(exemptionAge)
      db.settings.exemptionAge = exemptionAge
      persist()
    },
    async resetDemo() {
      db = clone(initial)
      persist()
    },
  }
}

function upsertGuest(db: DemoDatabase, guest: NonNullable<SaveStayInput['guest']>): string {
  if (!guest) throw new DomainError('Preencha nome, posto ou graduação e NIP do titular.')
  assertGuest(guest)
  if (guest.id) {
    const current = db.guests.find((item) => item.id === guest.id)
    if (!current) throw new DomainError('Hóspede não encontrado.')
    const duplicate = db.guests.find((item) => item.id !== guest.id && item.nip.trim() === guest.nip.trim())
    if (duplicate) throw new DomainError('NIP já cadastrado para outro militar.')
    current.fullName = guest.fullName.trim()
    current.rank = guest.rank.trim()
    current.nip = guest.nip.trim()
    current.om = guest.om.trim()
    current.phone = guest.phone.trim()
    current.notes = guest.notes
    return current.id
  }
  const byNip = db.guests.find((item) => item.nip.trim() === guest.nip.trim())
  if (byNip) {
    byNip.fullName = guest.fullName.trim()
    byNip.rank = guest.rank.trim()
    byNip.om = guest.om.trim()
    byNip.phone = guest.phone.trim()
    byNip.notes = guest.notes
    return byNip.id
  }
  const id = crypto.randomUUID()
  db.guests.push({
    id,
    fullName: guest.fullName.trim(),
    rank: guest.rank.trim(),
    nip: guest.nip.trim(),
    om: guest.om.trim(),
    phone: guest.phone.trim(),
    notes: guest.notes,
  })
  return id
}
