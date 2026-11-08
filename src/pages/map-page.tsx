import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mapDays, ReservationMap } from '@/components/reservation-map.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useSession } from '@/context/session.tsx'
import { currentMonth, formatMonth, monthBounds, shiftMonth, todayISO } from '@/lib/dates.ts'
import { dayMovement } from '@/lib/domain.ts'
import { toUserMessage } from '@/lib/errors.ts'
import type { Room, Stay } from '@/lib/types.ts'

const LEGEND = [
  ['bg-white border border-line', 'Livre'],
  ['bg-reservado', 'Reservado'],
  ['bg-ocupado', 'Ocupado'],
  ['bg-limpeza', 'Limpeza'],
  ['blocked-fill', 'Bloqueado'],
  ['bg-encerrada border border-line', 'Encerrada'],
] as const

export function MapPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const repository = state.status === 'ready' ? state.repository : null
  const [cursor, setCursor] = useState(currentMonth)
  const [rooms, setRooms] = useState<Room[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bounds = monthBounds(cursor.year, cursor.monthIndex)
  const today = todayISO()
  const showsToday = today >= bounds.start && today < bounds.end
  const movement = dayMovement(stays, today)

  const load = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    setError(null)
    try {
      const [nextRooms, nextStays] = await Promise.all([
        repository.listRooms(),
        repository.listReservations(bounds.start, bounds.end),
      ])
      setRooms(nextRooms)
      setStays(nextStays)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível carregar o mapa.'))
    } finally {
      setLoading(false)
    }
  }, [repository, bounds.start, bounds.end])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleCleaning(room: Room) {
    if (!repository) return
    try {
      await repository.updateRoom(room.id, { housekeeping: room.housekeeping === 'limpeza' ? 'limpa' : 'limpeza' })
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível atualizar a limpeza.'))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line bg-card px-3 py-2 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-sm font-semibold text-ink sm:min-w-44 sm:flex-none">{formatMonth(cursor.year, cursor.monthIndex)}</h2>
            <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(currentMonth())}>
              Hoje
            </Button>
          </div>
          <p className="text-xs text-muted sm:ml-2" data-testid="map-room-count">
            {loading ? 'Carregando UHs…' : `${rooms.length} UHs`}
            {showsToday && !loading ? ` · hoje ${movement.checkIns.length} entradas, ${movement.checkOuts.length} saídas, ${movement.inHouse.length} na casa` : ''}
          </p>
          <Button asChild className="w-full sm:ml-auto sm:w-auto" data-testid="nova-reserva">
            <Link to="/reserva/nova">
              <Plus className="h-4 w-4" />
              Nova reserva
            </Link>
          </Button>
        </div>
        <ul className="flex gap-2 overflow-x-auto text-xs">
          {LEGEND.map(([swatch, label]) => (
            <li key={label} className="flex shrink-0 items-center gap-1.5 text-muted">
              <span className={`h-3 w-3 rounded-sm ${swatch}`} />
              {label}
            </li>
          ))}
        </ul>
      </div>
      {error ? (
        <div className="m-3 rounded-md border border-danger/30 bg-card p-4" role="alert">
          <p className="text-sm">{error}</p>
          <Button className="mt-3" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {loading ? <p className="px-4 py-3 text-sm text-muted">Carregando o mapa…</p> : null}
      {!loading && !error && rooms.length === 0 ? (
        <div className="m-3 rounded-md border border-dashed border-line bg-card p-4" data-testid="empty-state">
          <p className="text-sm font-semibold">Nenhum quarto ativo no mapa</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            A recepção deveria listar as 14 UHs. Abra Quartos e confira se estão ativas. Sem UH ativa, não há onde lançar reserva.
          </p>
          <Button asChild className="mt-3">
            <Link to="/quartos">Abrir quartos</Link>
          </Button>
        </div>
      ) : null}
      {!loading && !error && rooms.length > 0 && stays.length === 0 ? (
        <p className="border-b border-line bg-paper px-3 py-2 text-sm text-ink">
          Nenhuma estada neste mês. Use <span className="font-semibold">Nova reserva</span> ou clique num dia livre do quarto.
        </p>
      ) : null}
      {!loading && !error && rooms.length > 0 ? (
        <div className="min-h-0 flex-1">
          <ReservationMap
            days={mapDays(bounds.start, bounds.end)}
            rooms={rooms}
            stays={stays}
            onCreate={(roomId, date) => navigate(`/reserva/nova?quarto=${roomId}&entrada=${date}`)}
            onOpen={(id) => navigate(`/reserva/${id}`)}
            onHousekeeping={(room) => void toggleCleaning(room)}
          />
        </div>
      ) : null}
    </div>
  )
}
