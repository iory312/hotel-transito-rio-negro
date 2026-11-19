import { createMemoryRepository } from '@/lib/memory-repository.ts'
import { categoryIdForSort } from '@/lib/desk.ts'
import { createSeedDatabase } from '@/lib/seed.ts'
import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from '@/lib/labels.ts'
import { DomainError } from '@/lib/domain.ts'
import type { HotelRepository } from '@/lib/repository.ts'
import type { DemoDatabase } from '@/lib/types.ts'

const STORAGE_KEY = 'htrn-demo-v2'
export const DEMO_SESSION_KEY = 'htrn-demo-session'

export interface DemoSession {
  email: string
  name: string
}

export function readDemoSession(): DemoSession | null {
  const raw = sessionStorage.getItem(DEMO_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DemoSession
    if (parsed.email !== DEMO_EMAIL || !parsed.name) return null
    return parsed
  } catch {
    return null
  }
}

export function writeDemoSession(session: DemoSession | null): void {
  if (!session) sessionStorage.removeItem(DEMO_SESSION_KEY)
  else sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
}

export function demoSignIn(email: string, password: string): DemoSession {
  if (email.trim().toLocaleLowerCase('pt-BR') !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    throw new DomainError('E-mail ou senha incorretos.')
  }
  return { email: DEMO_EMAIL, name: readDemoSession()?.name || DEMO_NAME }
}

function readDatabase(): DemoDatabase {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return createSeedDatabase()
  try {
    const parsed = JSON.parse(raw) as DemoDatabase
    if (!Array.isArray(parsed.rooms) || parsed.rooms.length !== 14 || !parsed.settings) return createSeedDatabase()
    if (!Array.isArray(parsed.guestDependents)) parsed.guestDependents = []
    const seed = createSeedDatabase()
    if (!Array.isArray(parsed.categories) || parsed.categories.length === 0) parsed.categories = seed.categories
    for (const room of parsed.rooms) {
      if (!room.categoryId) room.categoryId = categoryIdForSort(room.sortOrder, parsed.categories)
    }
    for (const reservation of parsed.reservations ?? []) {
      if (!reservation.blockKind) reservation.blockKind = reservation.status === 'bloqueado' ? 'manutencao' : ''
      if (typeof reservation.cancelReason !== 'string') reservation.cancelReason = ''
    }
    return parsed
  } catch {
    return createSeedDatabase()
  }
}

export function createDemoRepository(): HotelRepository {
  const initial = readDatabase()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  return createMemoryRepository(initial, {
    mode: 'demo',
    persist: (db) => localStorage.setItem(STORAGE_KEY, JSON.stringify(db)),
  })
}
