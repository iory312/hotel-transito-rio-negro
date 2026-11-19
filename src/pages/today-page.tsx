import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/confirm-dialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, formatDate, todayISO } from '@/lib/dates.ts'
import { dayMovement } from '@/lib/domain.ts'
import { todayBoard, uhCaption, type UhToday } from '@/lib/desk.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { ROOM_DAY_LABEL, STATUS_LABEL } from '@/lib/labels.ts'
import type { RoomCategory, Stay } from '@/lib/types.ts'
import { cn } from '@/lib/utils.ts'

const STATE_CLASS: Record<UhToday, string> = {
  livre: 'bg-white text-ink',
  limpeza: 'bg-limpeza text-navy-950',
  bloqueado: 'bg-navy-800 text-white',
  hospedado: 'bg-ocupado text-white',
  saida: 'bg-gold text-navy-950',
  chegada: 'bg-reservado text-navy-950',
  reservado: 'bg-reservado text-navy-950',
  pre_reserva: 'bg-pre text-navy-950',
  troca: 'bg-gold text-navy-950',
}

export function TodayPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const today = todayISO()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkout, setCheckout] = useState<Stay | null>(null)
  const [categories, setCategories] = useState<RoomCategory[]>([])
  const [board, setBoard] = useState<ReturnType<typeof todayBoard> | null>(null)
  const [stays, setStays] = useState<Stay[]>([])

  const load = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    setError(null)
    try {
      const [rooms, nextStays, nextCategories] = await Promise.all([
        repository.listRooms(),
        repository.listReservations(addDays(today, -1), addDays(today, 1)),
        repository.listCategories(),
      ])
      setStays(nextStays)
      setCategories(nextCategories)
      setBoard(todayBoard(rooms, nextStays, today, dayMovement(nextStays, today)))
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível carregar o dia.'))
    } finally {
      setLoading(false)
    }
  }, [repository, today])

  useEffect(() => {
    void load()
  }, [load])

  async function checkIn(stay: Stay) {
    if (!repository) return
    setSaving(true)
    setError(null)
    try {
      await repository.setStatus(stay.id, 'ocupada')
      setNotice(`Check-in de ${stay.guest?.fullName ?? 'hóspede'} registrado.`)
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível fazer o check-in.'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmCheckout() {
    if (!repository || !checkout) return
    setSaving(true)
    setError(null)
    try {
      await repository.setStatus(checkout.id, 'checkout')
      setNotice(`Check-out de ${checkout.guest?.fullName ?? 'hóspede'} registrado. A UH foi para limpeza.`)
      setCheckout(null)
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível fazer o check-out.'))
    } finally {
      setSaving(false)
    }
  }

  async function toggleCleaning(roomId: string, housekeeping: 'limpa' | 'limpeza') {
    if (!repository) return
    setError(null)
    try {
      await repository.updateRoom(roomId, { housekeeping: housekeeping === 'limpeza' ? 'limpa' : 'limpeza' })
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível atualizar a limpeza.'))
    }
  }

  const cards = board
    ? [
        ['Chegadas', board.arrivals.length, '#chegadas'],
        ['Saídas', board.departures.length, '#saidas'],
        ['Hospedados', board.inHouse.length, '#hospedados'],
        ['Livres', board.free.length, '#uhs'],
        ['Em limpeza', board.cleaning.length, '#uhs'],
        ['Bloqueados', board.blocked.length, '#uhs'],
      ]
    : []

  return (
    <div className="h-full overflow-auto" data-testid="today-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">Hoje · {formatDate(today)}</h2>
            <p className="text-sm text-muted">Chegadas, saídas e a situação de cada UH. O mapa continua em Mapa.</p>
          </div>
          <Button asChild>
            <Link to="/reserva/nova">Nova reserva</Link>
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
        {loading || !board ? <p className="text-sm text-muted">Carregando o movimento de hoje…</p> : null}
        {board ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cards.map(([label, count, href]) => (
                <a key={label} href={String(href)} className="rounded-md border border-line bg-card px-3 py-3">
                  <span className="block text-2xl font-semibold text-navy-950 tabular-nums">{count}</span>
                  <span className="text-sm font-semibold text-navy-900">{label}</span>
                </a>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <MovementList
                id="chegadas"
                title="Chegadas do dia"
                empty="Nenhuma chegada hoje."
                stays={board.arrivals}
                action={(stay) =>
                  stay.status === 'pre_reserva' || stay.status === 'reservada' ? (
                    <Button size="sm" disabled={saving} onClick={() => void checkIn(stay)}>
                      Check-in
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-muted">{STATUS_LABEL[stay.status]}</span>
                  )
                }
              />
              <MovementList
                id="saidas"
                title="Saídas do dia"
                empty="Nenhuma saída hoje."
                stays={board.departures}
                action={(stay) =>
                  stay.status === 'ocupada' ? (
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => setCheckout(stay)}>
                      Check-out
                    </Button>
                  ) : (
                    <span className="text-xs font-semibold text-muted">{STATUS_LABEL[stay.status]}</span>
                  )
                }
              />
            </div>
            <section id="hospedados" className="rounded-md border border-line bg-card p-3">
              <h3 className="text-base font-semibold text-navy-900">Hospedados agora</h3>
              {board.inHouse.length === 0 ? <p className="mt-2 text-sm text-muted">Ninguém hospedado neste momento.</p> : null}
              <ul className="mt-2 divide-y divide-line">
                {board.inHouse.map((stay) => (
                  <li key={stay.id} className="flex items-center justify-between gap-3 py-2">
                    <Link to={`/reserva/${stay.id}`} className="min-w-0">
                      <span className="block font-semibold">UH {stay.roomNumber} · {stay.guest?.fullName}</span>
                      <span className="block text-sm text-muted">Saída {formatDate(stay.checkOut)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section id="uhs" className="rounded-md border border-line bg-card p-3">
              <h3 className="text-base font-semibold text-navy-900">Situação das UHs</h3>
              <ul className="mt-2 divide-y divide-line">
                {board.rooms.map(({ room, state }) => {
                  const category = categories.find((item) => item.id === room.categoryId)
                  const caption = uhCaption(room.id, state, stays, today)
                  return (
                    <li key={room.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">UH {room.number}</p>
                        <p className="truncate text-sm text-muted">{category?.name ?? room.name}{caption ? ` · ${caption}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn('inline-flex min-h-8 items-center rounded-md px-2 text-xs font-semibold', STATE_CLASS[state])}>
                          {ROOM_DAY_LABEL[state]}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={room.housekeeping === 'limpeza' ? `Marcar UH ${room.number} como limpa` : `Enviar UH ${room.number} para limpeza`}
                          onClick={() => void toggleCleaning(room.id, room.housekeeping)}
                        >
                          {room.housekeeping === 'limpeza' ? 'Marcar limpa' : 'Em limpeza'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={checkout !== null}
        title="Fazer check-out"
        description={checkout ? `${checkout.guest?.fullName ?? 'Hóspede'} deixa a UH ${checkout.roomNumber}. O quarto vai para limpeza.` : ''}
        confirmLabel="Check-out"
        pending={saving}
        onOpenChange={(open) => { if (!open) setCheckout(null) }}
        onConfirm={() => void confirmCheckout()}
      />
    </div>
  )
}

function MovementList({
  id,
  title,
  empty,
  stays,
  action,
}: {
  id: string
  title: string
  empty: string
  stays: Stay[]
  action: (stay: Stay) => ReactNode
}) {
  return (
    <section id={id} className="rounded-md border border-line bg-card p-3">
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {stays.length === 0 ? <p className="mt-2 text-sm text-muted">{empty}</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {stays.map((stay) => (
          <li key={stay.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
            <Link to={`/reserva/${stay.id}`} className="min-w-0">
              <span className="block font-semibold">UH {stay.roomNumber} · {stay.guest?.rank} {stay.guest?.fullName}</span>
              <span className="block text-sm text-muted">{STATUS_LABEL[stay.status]} · {formatDate(stay.checkIn)} a {formatDate(stay.checkOut)}</span>
            </Link>
            {action(stay)}
          </li>
        ))}
      </ul>
    </section>
  )
}
