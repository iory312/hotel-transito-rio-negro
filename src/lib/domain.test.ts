import { describe, expect, it } from 'vitest'
import { addYears } from '@/lib/dates.ts'
import {
  breakfastList,
  buildBill,
  dayMovement,
  findOverlap,
  occupancy,
  blockGeometry,
} from '@/lib/domain.ts'
import { parseDailyRate } from '@/lib/money.ts'
import type { Reservation, Stay } from '@/lib/types.ts'

const checkIn = '2026-11-08'

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
      om: 'OM',
      phone: '',
      notes: '',
    },
    dailyRate: 100,
    notes: '',
    blockReason: '',
    dependents: [],
    payments: [],
    createdAt: checkIn,
    ...partial,
  }
}

describe('diária e idade', () => {
  it('interpreta valor digitado e não usa tarifa embutida', () => {
    expect(parseDailyRate('')).toBeNull()
    expect(parseDailyRate('80,5')).toBe(80.5)
    expect(parseDailyRate('1.234,56')).toBe(1234.56)
    expect(parseDailyRate('-1')).toBeNull()
  })

  it('isenta dependente com 6 anos na entrada e cobra quem tem 7', () => {
    const bill = buildBill({
      checkIn,
      checkOut: '2026-11-10',
      dailyRate: 80.5,
      exemptionAge: 6,
      titularName: 'Capitão de Fragata Paulo',
      dependents: [
        { fullName: 'Ana', birthDate: addYears(checkIn, -6) },
        { fullName: 'Bia', birthDate: '2019-11-09' },
        { fullName: 'Caio', birthDate: addYears(checkIn, -7) },
      ],
      payments: [{ amount: 100 }],
    })
    expect(bill.nights).toBe(2)
    expect(bill.lines.find((line) => line.name === 'Ana')?.pays).toBe(false)
    expect(bill.lines.find((line) => line.name === 'Bia')?.age).toBe(6)
    expect(bill.lines.find((line) => line.name === 'Caio')?.pays).toBe(true)
    expect(bill.payers).toBe(2)
    expect(bill.total).toBe(322)
    expect(bill.balance).toBe(222)
  })

  it('o titular sempre paga, mesmo sem dependentes', () => {
    const bill = buildBill({
      checkIn,
      checkOut: '2026-11-09',
      dailyRate: 0,
      exemptionAge: 6,
      titularName: 'Sozinho',
      dependents: [],
      payments: [],
    })
    expect(bill.payers).toBe(1)
    expect(bill.total).toBe(0)
  })

  it('respeita outra idade de isenção', () => {
    const bill = buildBill({
      checkIn,
      checkOut: '2026-11-09',
      dailyRate: 10,
      exemptionAge: 5,
      titularName: 'Titular',
      dependents: [{ fullName: 'Criança', birthDate: addYears(checkIn, -6) }],
      payments: [],
    })
    expect(bill.payers).toBe(2)
    expect(bill.total).toBe(20)
  })
})

describe('sobreposição e mapa', () => {
  const base: Reservation = {
    id: 'a',
    roomId: 'room-01',
    guestId: 'g',
    checkIn: '2026-11-10',
    checkOut: '2026-11-12',
    dailyRate: 10,
    status: 'reservada',
    notes: '',
    blockReason: '',
    createdAt: checkIn,
  }

  it('libera o quarto no dia da saída e ignora cancelada', () => {
    expect(findOverlap({ roomId: 'room-01', checkIn: '2026-11-12', checkOut: '2026-11-13' }, [base])).toBeNull()
    expect(findOverlap({ roomId: 'room-01', checkIn: '2026-11-11', checkOut: '2026-11-13' }, [base])?.id).toBe('a')
    expect(
      findOverlap({ roomId: 'room-01', checkIn: '2026-11-11', checkOut: '2026-11-13' }, [{ ...base, status: 'cancelada' }]),
    ).toBeNull()
  })

  it('posiciona o bloco só nas noites visíveis', () => {
    const days = ['2026-11-01', '2026-11-02', '2026-11-03']
    expect(blockGeometry('2026-10-30', '2026-11-03', days, 52)).toEqual({ left: 0, width: 100 })
    expect(blockGeometry('2026-11-03', '2026-11-04', days, 52)).toEqual({ left: 104, width: 48 })
    expect(blockGeometry('2026-11-04', '2026-11-06', days, 52)).toBeNull()
  })
})

describe('relatórios', () => {
  const date = '2026-11-08'
  const stays: Stay[] = [
    stay({ id: 'in', status: 'ocupada', checkIn: '2026-11-06', checkOut: '2026-11-10', dependents: [{ id: 'd', reservationId: 'in', fullName: 'Filho', birthDate: '2022-01-01' }] }),
    stay({ id: 'arrive', status: 'reservada', checkIn: date, checkOut: '2026-11-12', roomId: 'room-02', roomNumber: '02' }),
    stay({ id: 'leave', status: 'ocupada', checkIn: '2026-11-05', checkOut: date, roomId: 'room-03', roomNumber: '03' }),
    stay({ id: 'done', status: 'checkout', checkIn: '2026-11-05', checkOut: date, roomId: 'room-04', roomNumber: '04' }),
    stay({ id: 'block', status: 'bloqueado', checkIn: '2026-11-01', checkOut: '2026-11-20', roomId: 'room-05', guest: null }),
  ]

  it('separa entradas, saídas e quem dormiu na casa', () => {
    const movement = dayMovement(stays, date)
    expect(movement.checkIns.map((item) => item.id)).toEqual(['arrive'])
    expect(movement.checkOuts.map((item) => item.id).sort()).toEqual(['done', 'leave'])
    expect(movement.inHouse.map((item) => item.id)).toEqual(['in'])
  })

  it('lista o café de quem passou a noite, inclusive dependente', () => {
    const names = breakfastList(stays, date, 6).map((person) => person.name)
    expect(names).toContain('Titular')
    expect(names).toContain('Filho')
    expect(names).not.toContain('arrive')
  })

  it('calcula ocupação descontando bloqueio', () => {
    const result = occupancy(
      2,
      [
        stay({ id: 'o', status: 'reservada', checkIn: '2026-11-01', checkOut: '2026-11-02' }),
        stay({ id: 'b', status: 'bloqueado', checkIn: '2026-11-01', checkOut: '2026-11-03', roomId: 'room-02', guest: null }),
      ],
      '2026-11-01',
      '2026-11-03',
    )
    expect(result.roomNightsOccupied).toBe(1)
    expect(result.roomNightsBlocked).toBe(2)
    expect(result.roomNightsAvailable).toBe(2)
    expect(result.percent).toBe(50)
  })
})
