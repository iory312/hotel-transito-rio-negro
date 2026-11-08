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

  it('cadastra hóspede com dependentes e esconde UH inativa do mapa', async () => {
    const today = todayISO()
    const repo = createMemoryRepository(createSeedDatabase(today))
    const id = await repo.saveGuest({
      fullName: 'Carlos Lima',
      rank: 'Cabo',
      nip: '12.3456.78',
      om: 'OM Teste',
      phone: '92999999999',
      notes: '',
      dependents: [{ fullName: 'Lia Lima', birthDate: '2020-01-02' }],
    })
    const profile = await repo.getGuest(id)
    expect(profile?.guest.rank).toBe('Cabo')
    expect(profile?.dependents).toHaveLength(1)
    expect(profile?.dependents[0]?.fullName).toBe('Lia Lima')
    await repo.saveGuest({
      id,
      fullName: 'Carlos Lima',
      rank: 'Cabo',
      nip: '12.3456.78',
      om: 'OM Teste',
      phone: '',
      notes: 'Atualizado',
      dependents: [],
    })
    expect((await repo.getGuest(id))?.dependents).toHaveLength(0)
    await expect(
      repo.saveGuest({
        id: 'nao-existe',
        fullName: 'Carlos Lima',
        rank: 'Cabo',
        nip: '99.9999.99',
        om: '',
        phone: '',
        notes: '',
        dependents: [],
      }),
    ).rejects.toThrow(/não encontrado/)

    await repo.updateRoom('room-14', { active: false, notes: 'Fora de uso' })
    expect(await repo.listRooms()).toHaveLength(13)
    const all = await repo.listRooms({ includeInactive: true })
    expect(all).toHaveLength(14)
    expect(all.find((room) => room.id === 'room-14')?.active).toBe(false)
    await expect(
      repo.saveReservation({
        roomId: 'room-14',
        checkIn: addDays(today, 20),
        checkOut: addDays(today, 22),
        dailyRate: 40,
        notes: '',
        kind: 'hospedagem',
        blockReason: '',
        guest: { fullName: 'Novo Militar', rank: 'Cabo', nip: '33.3333.33', om: '', phone: '', notes: '' },
        dependents: [],
      }),
    ).rejects.toThrow(/não encontrado/)
  })
})
