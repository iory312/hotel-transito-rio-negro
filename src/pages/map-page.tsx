import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mapDays, ReservationMap } from '@/components/reservation-map.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useSession } from '@/context/session.tsx'
import { currentMonth, formatMonth, monthBounds, shiftMonth } from '@/lib/dates.ts'
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
      <div className="flex flex-col gap-3 border-b border-line bg-paper px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="min-w-0 flex-1 text-center font-display text-3xl text-navy-900">{formatMonth(cursor.year, cursor.monthIndex)}</h2>
          <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          <Button variant="outline" onClick={() => setCursor(currentMonth())}>
            Hoje
          </Button>
        </div>
        <ul className="flex gap-2 overflow-x-auto pb-1 text-xs">
          {LEGEND.map(([swatch, label]) => (
            <li key={label} className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2 py-1">
              <span className={`h-3 w-3 rounded-sm ${swatch}`} />
              {label}
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted lg:hidden">Deslize para o lado para ver os dias. O nome do quarto permanece fixo.</p>
      </div>
      {error ? (
        <div className="m-3 rounded-md border border-danger/30 bg-card p-4" role="alert">
          <p>{error}</p>
          <Button className="mt-3" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {loading ? <p className="p-4 text-sm text-muted">Carregando o mapa…</p> : null}
      {!loading && stays.length === 0 && !error ? <p className="px-4 pt-3 text-sm text-muted">Nenhuma hospedagem neste mês.</p> : null}
      <div className="min-h-[24rem] flex-1">
        <ReservationMap
          days={mapDays(bounds.start, bounds.end)}
          rooms={rooms}
          stays={stays}
          onCreate={(roomId, date) => navigate(`/reserva/nova?quarto=${roomId}&entrada=${date}`)}
          onOpen={(id) => navigate(`/reserva/${id}`)}
          onHousekeeping={(room) => void toggleCleaning(room)}
        />
      </div>
    </div>
  )
}
