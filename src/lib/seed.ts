import { addDays, addYears, todayISO } from '@/lib/dates.ts'
import type { DemoDatabase } from '@/lib/types.ts'

export function createSeedDatabase(today = todayISO()): DemoDatabase {
  const rooms = Array.from({ length: 14 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return {
      id: `room-${number}`,
      number,
      name: `Quarto ${number}`,
      housekeeping: number === '02' || number === '09' ? ('limpeza' as const) : ('limpa' as const),
      notes: '',
      sortOrder: index + 1,
      active: true,
    }
  })

  const pauloIn = addDays(today, -2)
  const alineIn = today
  const joseIn = addDays(today, -4)
  const martaIn = addDays(today, -4)
  const brunoIn = addDays(today, 2)

  return {
    rooms,
    settings: { hotelName: 'Hotel de Trânsito Rio Negro', exemptionAge: 6 },
    guestDependents: [
      {
        id: 'gdep-helena',
        guestId: 'guest-paulo',
        fullName: 'Helena Monteiro',
        birthDate: addYears(pauloIn, -11),
      },
      {
        id: 'gdep-caio',
        guestId: 'guest-paulo',
        fullName: 'Caio Monteiro',
        birthDate: addYears(pauloIn, -4),
      },
      {
        id: 'gdep-ana',
        guestId: 'guest-jose',
        fullName: 'Ana Azevedo',
        birthDate: addYears(joseIn, -6),
      },
      {
        id: 'gdep-clara',
        guestId: 'guest-bruno',
        fullName: 'Clara Fachin',
        birthDate: addYears(brunoIn, -34),
      },
    ],
    guests: [
      {
        id: 'guest-paulo',
        fullName: 'Paulo Henrique Monteiro',
        rank: 'Capitão de Fragata',
        nip: '85.2210.11',
        om: 'Comando do 9º Distrito Naval',
        phone: '(92) 98810-2211',
        notes: 'Trânsito a serviço. Prefere quarto no térreo.',
      },
      {
        id: 'guest-aline',
        fullName: 'Aline Soares Ribeiro',
        rank: 'Capitão-Tenente',
        nip: '10.3344.21',
        om: 'Capitania Fluvial de Tabatinga',
        phone: '(92) 98400-1102',
        notes: '',
      },
      {
        id: 'guest-jose',
        fullName: 'José Nilton Azevedo',
        rank: 'Primeiro-Sargento',
        nip: '77.1902.06',
        om: 'Centro de Intendência da Marinha em Manaus',
        phone: '(92) 99120-3344',
        notes: 'Saída prevista para hoje.',
      },
      {
        id: 'guest-marta',
        fullName: 'Marta Cavalcanti',
        rank: 'Suboficial',
        nip: '63.4411.90',
        om: 'Comando do 9º Distrito Naval',
        phone: '(92) 99333-8080',
        notes: '',
      },
      {
        id: 'guest-bruno',
        fullName: 'Bruno Keller Fachin',
        rank: 'Segundo-Tenente',
        nip: '19.8801.44',
        om: 'Organização Militar de Apoio em Manaus',
        phone: '(92) 99201-4470',
        notes: '',
      },
    ],
    reservations: [
      {
        id: 'stay-paulo',
        roomId: 'room-01',
        guestId: 'guest-paulo',
        checkIn: pauloIn,
        checkOut: addDays(today, 3),
        dailyRate: 90,
        status: 'ocupada',
        notes: 'Chegou com a família no voo da noite.',
        blockReason: '',
        createdAt: pauloIn,
      },
      {
        id: 'stay-aline',
        roomId: 'room-03',
        guestId: 'guest-aline',
        checkIn: alineIn,
        checkOut: addDays(today, 4),
        dailyRate: 75,
        status: 'reservada',
        notes: 'Entrada prevista para hoje.',
        blockReason: '',
        createdAt: addDays(today, -3),
      },
      {
        id: 'stay-jose',
        roomId: 'room-05',
        guestId: 'guest-jose',
        checkIn: joseIn,
        checkOut: today,
        dailyRate: 60,
        status: 'ocupada',
        notes: '',
        blockReason: '',
        createdAt: joseIn,
      },
      {
        id: 'stay-block',
        roomId: 'room-07',
        guestId: null,
        checkIn: addDays(today, 1),
        checkOut: addDays(today, 5),
        dailyRate: 0,
        status: 'bloqueado',
        notes: '',
        blockReason: 'Manutenção do climatizador',
        createdAt: addDays(today, -1),
      },
      {
        id: 'stay-marta',
        roomId: 'room-09',
        guestId: 'guest-marta',
        checkIn: martaIn,
        checkOut: addDays(today, -1),
        dailyRate: 80,
        status: 'checkout',
        notes: 'Estadia encerrada. Quarto aguarda limpeza.',
        blockReason: '',
        createdAt: martaIn,
      },
      {
        id: 'stay-bruno',
        roomId: 'room-12',
        guestId: 'guest-bruno',
        checkIn: brunoIn,
        checkOut: addDays(today, 6),
        dailyRate: 110,
        status: 'reservada',
        notes: '',
        blockReason: '',
        createdAt: today,
      },
    ],
    dependents: [
      {
        id: 'dep-helena',
        reservationId: 'stay-paulo',
        fullName: 'Helena Monteiro',
        birthDate: addYears(pauloIn, -11),
      },
      {
        id: 'dep-caio',
        reservationId: 'stay-paulo',
        fullName: 'Caio Monteiro',
        birthDate: addYears(pauloIn, -4),
      },
      {
        id: 'dep-ana',
        reservationId: 'stay-jose',
        fullName: 'Ana Azevedo',
        birthDate: addYears(joseIn, -6),
      },
      {
        id: 'dep-clara',
        reservationId: 'stay-bruno',
        fullName: 'Clara Fachin',
        birthDate: addYears(brunoIn, -34),
      },
    ],
    payments: [
      {
        id: 'pay-paulo',
        reservationId: 'stay-paulo',
        amount: 400,
        method: 'pix',
        paidAt: pauloIn,
        notes: 'Entrada parcial',
        createdAt: pauloIn,
      },
      {
        id: 'pay-jose',
        reservationId: 'stay-jose',
        amount: 240,
        method: 'dinheiro',
        paidAt: joseIn,
        notes: '',
        createdAt: joseIn,
      },
      {
        id: 'pay-marta',
        reservationId: 'stay-marta',
        amount: 160,
        method: 'transferencia',
        paidAt: addDays(today, -1),
        notes: '',
        createdAt: addDays(today, -1),
      },
    ],
  }
}
