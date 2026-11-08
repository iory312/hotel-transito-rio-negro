import type { SupabaseClient } from '@supabase/supabase-js'
import { DomainError, sanitizeSearch } from '@/lib/domain.ts'
import { publicError } from '@/lib/errors.ts'
import type { HotelRepository } from '@/lib/repository.ts'
import type {
  Dependent,
  Guest,
  HousekeepingStatus,
  Payment,
  PaymentMethod,
  ReservationStatus,
  Stay,
} from '@/lib/types.ts'

interface GuestRow {
  id: string
  full_name: string
  rank: string
  nip: string
  om: string
  phone: string
  notes: string
}

interface DependentRow {
  id: string
  full_name: string
  birth_date: string
}

interface PaymentRow {
  id: string
  amount: number | string
  method: PaymentMethod
  paid_at: string
  notes: string
  created_at: string
}

interface StayRow {
  id: string
  room_id: string
  guest_id: string | null
  check_in: string
  check_out: string
  daily_rate: number | string
  status: ReservationStatus
  notes: string
  block_reason: string
  created_at: string
  rooms: { number: string; name: string } | { number: string; name: string }[] | null
  guests: GuestRow | GuestRow[] | null
  reservation_dependents: DependentRow[] | null
  payments: PaymentRow[] | null
}

const STAY_COLUMNS = `
  id, room_id, guest_id, check_in, check_out, daily_rate, status, notes, block_reason, created_at,
  rooms (number, name),
  guests (id, full_name, rank, nip, om, phone, notes),
  reservation_dependents (id, full_name, birth_date),
  payments (id, amount, method, paid_at, notes, created_at)
`

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function asNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value)
}

function mapGuest(row: GuestRow): Guest {
  return {
    id: row.id,
    fullName: row.full_name,
    rank: row.rank,
    nip: row.nip,
    om: row.om,
    phone: row.phone,
    notes: row.notes,
  }
}

function mapStay(row: StayRow): Stay {
  const room = one(row.rooms)
  const guest = one(row.guests)
  const dependents: Dependent[] = (row.reservation_dependents ?? []).map((dependent) => ({
    id: dependent.id,
    reservationId: row.id,
    fullName: dependent.full_name,
    birthDate: dependent.birth_date,
  }))
  const payments: Payment[] = (row.payments ?? []).map((payment) => ({
    id: payment.id,
    reservationId: row.id,
    amount: asNumber(payment.amount),
    method: payment.method,
    paidAt: payment.paid_at,
    notes: payment.notes,
    createdAt: payment.created_at.slice(0, 10),
  }))
  return {
    id: row.id,
    roomId: row.room_id,
    roomNumber: room?.number ?? '—',
    roomName: room?.name ?? 'Quarto',
    guest: guest ? mapGuest(guest) : null,
    checkIn: row.check_in,
    checkOut: row.check_out,
    dailyRate: asNumber(row.daily_rate),
    status: row.status,
    notes: row.notes,
    blockReason: row.block_reason,
    dependents,
    payments,
    createdAt: row.created_at.slice(0, 10),
  }
}

async function expectOk<T>(result: { data: T; error: { message: string } | null }, fallback: string): Promise<T> {
  if (result.error) throw new DomainError(publicError(result.error.message, fallback))
  return result.data
}

export function createRemoteRepository(client: SupabaseClient, host: string | null): HotelRepository {
  return {
    mode: 'remote',
    host,
    async listRooms() {
      const result = await client.from('rooms').select('id, number, name, housekeeping, notes, sort_order, active').eq('active', true).order('sort_order')
      const rows = await expectOk(result, 'Não foi possível carregar os quartos.')
      return (rows as RoomRow[]).map((room) => ({
        id: room.id,
        number: room.number,
        name: room.name,
        housekeeping: room.housekeeping,
        notes: room.notes,
        sortOrder: room.sort_order,
        active: room.active,
      }))
    },
    async updateRoom(id, patch) {
      const update: Record<string, string> = {}
      if (patch.number !== undefined) update.number = patch.number.trim()
      if (patch.name !== undefined) update.name = patch.name.trim()
      if (patch.notes !== undefined) update.notes = patch.notes
      if (patch.housekeeping) update.housekeeping = patch.housekeeping
      const result = await client.from('rooms').update(update).eq('id', id)
      await expectOk(result, 'Não foi possível salvar o quarto.')
    },
    async listGuests(search) {
      const query = sanitizeSearch(search)
      let request = client.from('guests').select('id, full_name, rank, nip, om, phone, notes').order('full_name').limit(200)
      if (query) {
        request = request.or(`full_name.ilike.%${query}%,rank.ilike.%${query}%,nip.ilike.%${query}%,om.ilike.%${query}%`)
      }
      const rows = await expectOk(await request, 'Não foi possível carregar os hóspedes.')
      return (rows as GuestRow[]).map(mapGuest)
    },
    async getGuest(id) {
      const guestResult = await client.from('guests').select('id, full_name, rank, nip, om, phone, notes').eq('id', id).maybeSingle()
      const guestRow = await expectOk(guestResult, 'Não foi possível carregar o hóspede.')
      if (!guestRow) return null
      const staysResult = await client
        .from('reservations')
        .select(STAY_COLUMNS)
        .eq('guest_id', id)
        .order('check_in', { ascending: false })
        .limit(200)
      const stays = await expectOk(staysResult, 'Não foi possível carregar o histórico.')
      return { guest: mapGuest(guestRow as GuestRow), stays: (stays as StayRow[]).map(mapStay) }
    },
    async saveGuest(guest) {
      await expectOk(
        await client.rpc('save_guest', {
          payload: {
            id: guest.id,
            full_name: guest.fullName,
            rank: guest.rank,
            nip: guest.nip,
            om: guest.om,
            phone: guest.phone,
            notes: guest.notes,
          },
        }),
        'Não foi possível salvar o hóspede.',
      )
    },
    async listReservations(from, to) {
      const result = await client
        .from('reservations')
        .select(STAY_COLUMNS)
        .neq('status', 'cancelada')
        .lt('check_in', to)
        .gt('check_out', from)
        .limit(2000)
      const rows = await expectOk(result, 'Não foi possível carregar as reservas.')
      return (rows as StayRow[]).map(mapStay)
    },
    async getReservation(id) {
      const result = await client.from('reservations').select(STAY_COLUMNS).eq('id', id).maybeSingle()
      const row = await expectOk(result, 'Não foi possível carregar a reserva.')
      return row ? mapStay(row as StayRow) : null
    },
    async saveReservation(input) {
      const payload = {
        id: input.id ?? null,
        room_id: input.roomId,
        check_in: input.checkIn,
        check_out: input.checkOut,
        daily_rate: input.kind === 'bloqueio' ? 0 : input.dailyRate,
        notes: input.notes,
        kind: input.kind,
        block_reason: input.blockReason,
        guest: input.guest
          ? {
              id: input.guest.id ?? null,
              full_name: input.guest.fullName,
              rank: input.guest.rank,
              nip: input.guest.nip,
              om: input.guest.om,
              phone: input.guest.phone,
              notes: input.guest.notes,
            }
          : null,
        dependents: input.dependents.map((dependent) => ({
          full_name: dependent.fullName,
          birth_date: dependent.birthDate,
        })),
      }
      const id = await expectOk(await client.rpc('save_stay', { payload }), 'Não foi possível salvar a reserva.')
      return String(id)
    },
    async setStatus(id, status) {
      await expectOk(await client.rpc('set_stay_status', { p_id: id, p_status: status }), 'Não foi possível atualizar o status.')
    },
    async addPayment(input) {
      await expectOk(
        await client.rpc('add_payment', {
          p_reservation_id: input.reservationId,
          p_amount: input.amount,
          p_method: input.method,
          p_paid_at: input.paidAt,
          p_notes: input.notes,
        }),
        'Não foi possível registrar o pagamento.',
      )
    },
    async deletePayment(id) {
      await expectOk(await client.rpc('delete_payment', { p_id: id }), 'Não foi possível excluir o pagamento.')
    },
    async getSettings() {
      const result = await client.from('settings').select('hotel_name, exemption_age').eq('id', 1).single()
      const row = await expectOk(result, 'Não foi possível carregar as configurações.')
      const settings = row as { hotel_name: string; exemption_age: number }
      return { hotelName: settings.hotel_name, exemptionAge: settings.exemption_age }
    },
    async updateSettings(exemptionAge) {
      await expectOk(
        await client.from('settings').update({ exemption_age: exemptionAge }).eq('id', 1),
        'Não foi possível salvar a idade de isenção.',
      )
    },
  }
}

interface RoomRow {
  id: string
  number: string
  name: string
  housekeeping: HousekeepingStatus
  notes: string
  sort_order: number
  active: boolean
}

