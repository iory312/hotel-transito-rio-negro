import { describe, expect, it } from 'vitest'
import { addDays, addYears } from '@/lib/dates.ts'
import { buildBill } from '@/lib/domain.ts'
import {
  capacityWarning,
  filterReservations,
  guestsByOm,
  moveStay,
  occupantCount,
  paymentStanding,
  placementProblem,
  resizeStay,
  revenueReport,
  toCsv,
  uhToday,
} from '@/lib/desk.ts'
import type { Reservation, Room, Stay } from '@/lib/types.ts'

const day = '2026-11-19'

function room(partial: Partial<Room> & Pick<Room, 'id' | 'number'>): Room {
  return {
    name: `Quarto ${partial.number}`,
    categoryId: 'cat',
    housekeeping: 'limpa',
    notes: '',
    sortOrder: Number(partial.number),
    active: true,
    ...partial,
  }
}

function stay(partial: Partial<Stay> & Pick<Stay, 'id' | 'status' | 'checkIn' | 'checkOut'>): Stay {
  return {
    roomId: 'room-01',
    roomNumber: '01',
    roomName: 'Quarto 01',
    guest: {
      id: 'g',
      fullName: 'Titular',
      rank: 'Cabo',
      nip: '11.1111.11',
      om: 'OM Alfa',
      phone: '',
      notes: '',
    },
    dailyRate: 100,
    notes: '',
    blockReason: '',
    blockKind: '',
    cancelReason: '',
    dependents: [],
    payments: [],
    createdAt: day,
    ...partial,
  }
}

function span(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'roomId' | 'checkIn' | 'checkOut' | 'status'>): Reservation {
  return {
    guestId: 'g',
    dailyRate: 10,
    notes: '',
    blockReason: '',
    blockKind: '',
    cancelReason: '',
    createdAt: day,
    ...partial,
  }
}

describe('cobrança e idade na recepção', () => {
  it('mantém total = diária × noites × pagantes, com isenção aos 6 anos', () => {
    const bill = buildBill({
      checkIn: day,
      checkOut: '2026-11-22',
      dailyRate: 80,
      exemptionAge: 6,
      titularName: 'Titular',
      dependents: [
        { fullName: 'Isento', birthDate: addYears(day, -6) },
        { fullName: 'Pagante', birthDate: addYears(day, -7) },
      ],
      payments: [{ amount: 100 }],
    })
    expect(bill.nights).toBe(3)
    expect(bill.payers).toBe(2)
    expect(bill.total).toBe(480)
    expect(paymentStanding(bill)).toBe('parcial')
    expect(paymentStanding({ ready: true, total: 480, paid: 480 })).toBe('pago')
    expect(paymentStanding({ ready: true, total: 480, paid: 0 })).toBe('pendente')
    expect(paymentStanding({ ready: true, total: 0, paid: 0 })).toBe('pago')
  })

  it('avisa quando a reserva passa da capacidade e conta todas as pessoas', () => {
    expect(occupantCount('Maria', [{ fullName: 'Ana' }, { fullName: '  ' }])).toBe(2)
    expect(capacityWarning(2, 2)).toBeNull()
    expect(capacityWarning(4, 2)).toMatch(/comporta até 2/)
    expect(capacityWarning(3, null)).toBeNull()
  })
})

describe('conflito de reserva e bloqueio', () => {
  const rooms = [room({ id: 'room-01', number: '01' }), room({ id: 'room-02', number: '02', active: false })]
  const reservations = [
    span({ id: 'stay', roomId: 'room-01', checkIn: '2026-11-20', checkOut: '2026-11-23', status: 'reservada' }),
    span({
      id: 'block',
      roomId: 'room-01',
      checkIn: '2026-11-10',
      checkOut: '2026-11-12',
      status: 'bloqueado',
      guestId: null,
      blockKind: 'manutencao',
      blockReason: 'Manutenção',
    }),
  ]

  it('recusa sobrepor reserva ou bloqueio e aceita a saída no mesmo dia', () => {
    expect(
      placementProblem({
        roomId: 'room-01',
        checkIn: '2026-11-21',
        checkOut: '2026-11-22',
        rooms,
        reservations,
      }),
    ).toMatch(/ocupado, reservado ou bloqueado/)
    expect(
      placementProblem({
        roomId: 'room-01',
        checkIn: '2026-11-11',
        checkOut: '2026-11-13',
        rooms,
        reservations,
      }),
    ).toMatch(/bloqueado/)
    expect(
      placementProblem({
        roomId: 'room-01',
        checkIn: '2026-11-23',
        checkOut: '2026-11-24',
        rooms,
        reservations,
      }),
    ).toBeNull()
    expect(
      placementProblem({
        id: 'stay',
        roomId: 'room-01',
        checkIn: '2026-11-20',
        checkOut: '2026-11-23',
        rooms,
        reservations,
      }),
    ).toBeNull()
  })

  it('recusa quarto inativo e reserva encerrada', () => {
    expect(
      placementProblem({
        roomId: 'room-02',
        checkIn: '2026-11-01',
        checkOut: '2026-11-02',
        rooms,
        reservations,
      }),
    ).toMatch(/inativo/)
    expect(
      placementProblem({
        status: 'checkout',
        roomId: 'room-01',
        checkIn: '2026-11-01',
        checkOut: '2026-11-02',
        rooms,
        reservations,
      }),
    ).toMatch(/encerrada/)
  })
})

describe('arrastar e soltar', () => {
  const rooms = [
    { id: 'room-01' },
    { id: 'room-02' },
    { id: 'room-03' },
  ]
  const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

  it('move a reserva para outra UH e outras datas pelo deslocamento do ponteiro', () => {
    const moved = moveStay({
      checkIn: '2026-11-19',
      checkOut: '2026-11-22',
      roomIndex: 0,
      rooms,
      grabDayIndex: 1,
      grabRoomIndex: 0,
      dropDayIndex: 3,
      dropRoomIndex: 2,
    })
    expect(moved).toEqual({ roomId: 'room-03', checkIn: '2026-11-21', checkOut: '2026-11-24' })
    expect(
      moveStay({
        checkIn: '2026-11-19',
        checkOut: '2026-11-22',
        roomIndex: 0,
        rooms,
        grabDayIndex: 1,
        grabRoomIndex: 0,
        dropDayIndex: 1,
        dropRoomIndex: 0,
      }),
    ).toEqual({ roomId: 'room-01', checkIn: '2026-11-19', checkOut: '2026-11-22' })
  })

  it('não solta fora da grade', () => {
    expect(
      moveStay({
        checkIn: '2026-11-19',
        checkOut: '2026-11-22',
        roomIndex: 2,
        rooms,
        grabDayIndex: 1,
        grabRoomIndex: 2,
        dropDayIndex: 2,
        dropRoomIndex: 4,
      }),
    ).toBeNull()
  })

  it('redimensiona a entrada ou a saída e recusa período invertido', () => {
    expect(
      resizeStay({
        checkIn: '2026-11-19',
        checkOut: '2026-11-22',
        roomId: 'room-01',
        edge: 'end',
        dropDayIndex: 4,
        days,
      }),
    ).toEqual({ roomId: 'room-01', checkIn: '2026-11-19', checkOut: '2026-11-23' })
    expect(
      resizeStay({
        checkIn: '2026-11-19',
        checkOut: '2026-11-22',
        roomId: 'room-01',
        edge: 'start',
        dropDayIndex: 2,
        days,
      }),
    ).toEqual({ roomId: 'room-01', checkIn: '2026-11-20', checkOut: '2026-11-22' })
    expect(
      resizeStay({
        checkIn: '2026-11-19',
        checkOut: '2026-11-22',
        roomId: 'room-01',
        edge: 'start',
        dropDayIndex: 4,
        days,
      }),
    ).toBeNull()
  })

  it('a soltura em cima de bloqueio continua inválida', () => {
    const placed = moveStay({
      checkIn: '2026-11-18',
      checkOut: '2026-11-19',
      roomIndex: 1,
      rooms,
      grabDayIndex: 0,
      grabRoomIndex: 1,
      dropDayIndex: 0,
      dropRoomIndex: 0,
    })
    expect(placed?.roomId).toBe('room-01')
    expect(
      placementProblem({
        roomId: placed!.roomId,
        checkIn: placed!.checkIn,
        checkOut: addDays(placed!.checkIn, 3),
        rooms: rooms.map((item) => ({ ...item, active: true })),
        reservations: [
          span({ id: 'block', roomId: 'room-01', checkIn: '2026-11-18', checkOut: '2026-11-20', status: 'bloqueado', guestId: null }),
        ],
      }),
    ).toMatch(/bloqueado/)
  })
})

describe('lista, hoje e relatórios', () => {
  const rooms = [
    room({ id: 'room-01', number: '01' }),
    room({ id: 'room-02', number: '02', housekeeping: 'limpeza' }),
    room({ id: 'room-03', number: '03' }),
  ]
  const stays = [
    stay({ id: 'house', status: 'ocupada', checkIn: '2026-11-17', checkOut: '2026-11-21', roomId: 'room-01' }),
    stay({
      id: 'arrive',
      status: 'pre_reserva',
      checkIn: day,
      checkOut: '2026-11-22',
      roomId: 'room-03',
      roomNumber: '03',
      guest: {
        id: 'g2',
        fullName: 'Aline Soares',
        rank: 'Capitão-Tenente',
        nip: '10.3344.21',
        om: 'OM Bravo',
        phone: '',
        notes: '',
      },
    }),
    stay({
      id: 'block',
      status: 'bloqueado',
      checkIn: '2026-11-18',
      checkOut: '2026-11-25',
      roomId: 'room-02',
      roomNumber: '02',
      guest: null,
      blockKind: 'interdicao',
      blockReason: 'Infiltração',
      dailyRate: 0,
    }),
  ]

  it('classifica a UH do dia', () => {
    expect(uhToday(rooms[0]!, stays, day)).toBe('hospedado')
    expect(uhToday(rooms[1]!, stays, day)).toBe('bloqueado')
    expect(uhToday(rooms[2]!, stays, day)).toBe('chegada')
    expect(uhToday(room({ id: 'room-04', number: '04', housekeeping: 'limpeza' }), stays, day)).toBe('limpeza')
    expect(uhToday(room({ id: 'room-05', number: '05' }), stays, day)).toBe('livre')
  })

  it('filtra por nome, NIP, UH, status e período', () => {
    const found = filterReservations(stays, {
      query: '103344',
      statuses: ['pre_reserva'],
      from: '2026-11-01',
      toExclusive: '2026-12-01',
      sort: 'checkIn',
      direction: 'asc',
      exemptionAge: 6,
    })
    expect(found.map((item) => item.id)).toEqual(['arrive'])
    const byRoom = filterReservations(stays, {
      query: '1',
      statuses: [],
      from: '2026-11-01',
      toExclusive: '2026-12-01',
      sort: 'room',
      direction: 'asc',
      exemptionAge: 6,
    })
    expect(byRoom.map((item) => item.roomNumber)).toEqual(['01'])
    expect(byRoom.some((item) => item.status === 'bloqueado')).toBe(false)
  })

  it('separa receita prevista e recebida e agrupa por OM', () => {
    const priced = [
      stay({
        id: 'a',
        status: 'ocupada',
        checkIn: '2026-11-18',
        checkOut: '2026-11-21',
        dailyRate: 50,
        payments: [{ id: 'p', reservationId: 'a', amount: 40, method: 'folha', paidAt: '2026-11-19', notes: '', createdAt: day }],
      }),
      stay({
        id: 'b',
        status: 'reservada',
        checkIn: '2026-11-19',
        checkOut: '2026-11-20',
        roomId: 'room-03',
        roomNumber: '03',
        dailyRate: 70,
        guest: {
          id: 'g2',
          fullName: 'Outro',
          rank: 'Cabo',
          nip: '22.2222.22',
          om: 'OM Alfa',
          phone: '',
          notes: '',
        },
      }),
    ]
    const report = revenueReport(priced, '2026-11-19', '2026-11-21', 6)
    expect(report.rows.find((row) => row.id === 'a')?.nights).toBe(2)
    expect(report.rows.find((row) => row.id === 'a')?.expected).toBe(100)
    expect(report.rows.find((row) => row.id === 'a')?.received).toBe(40)
    expect(report.rows.find((row) => row.id === 'b')?.expected).toBe(70)
    expect(report.expected).toBe(170)
    expect(report.received).toBe(40)
    expect(guestsByOm(priced, '2026-11-01', '2026-12-01')).toEqual([{ om: 'OM Alfa', guests: 2, stays: 2 }])
  })

  it('gera CSV com separador de planilha e aspas', () => {
    const csv = toCsv(['OM', 'Nome'], [['9º Distrito', 'Paulo; Filho']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('9º Distrito;"Paulo; Filho"')
  })
})
