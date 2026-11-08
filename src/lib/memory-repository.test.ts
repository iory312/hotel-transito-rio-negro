import { describe, expect, it } from 'vitest'
import { addDays, todayISO } from '@/lib/dates.ts'
import { createMemoryRepository } from '@/lib/memory-repository.ts'
import { createSeedDatabase } from '@/lib/seed.ts'

describe('repositório em memória', () => {
  it('impede overbooking e marca limpeza no check-out', async () => {
    const today = todayISO()
    const repo = createMemoryRepository(createSeedDatabase(today))
    const rooms = await repo.listRooms()
    expect(rooms).toHaveLength(14)
    await expect(
      repo.saveReservation({
        roomId: 'room-01',
        checkIn: today,
        checkOut: today,
        dailyRate: 10,
        notes: '',
        kind: 'hospedagem',
        blockReason: '',
        guest: { fullName: 'Novo Militar', rank: 'Cabo', nip: '22.2222.22', om: '', phone: '', notes: '' },
        dependents: [],
      }),
    ).rejects.toThrow(/posterior/)

    await expect(
      repo.saveReservation({
        roomId: 'room-01',
        checkIn: today,
        checkOut: addDays(today, 2),
        dailyRate: 10,
        notes: '',
        kind: 'hospedagem',
        blockReason: '',
        guest: { fullName: 'Novo Militar', rank: 'Cabo', nip: '22.2222.22', om: '', phone: '', notes: '' },
        dependents: [],
      }),
    ).rejects.toThrow(/ocupado, reservado ou bloqueado/)

    await repo.setStatus('stay-jose', 'checkout')
    const room = (await repo.listRooms()).find((item) => item.id === 'room-05')
    expect(room?.housekeeping).toBe('limpeza')
    const jose = await repo.getReservation('stay-jose')
    expect(jose?.status).toBe('checkout')
  })
})
