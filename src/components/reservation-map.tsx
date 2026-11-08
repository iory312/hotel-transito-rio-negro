import { Brush } from 'lucide-react'
import { blockGeometry } from '@/lib/domain.ts'
import { dayNumber, eachDate, isWeekend, todayISO, weekdayShort } from '@/lib/dates.ts'
import { STATUS_LABEL } from '@/lib/labels.ts'
import type { Room, Stay } from '@/lib/types.ts'
import { cn } from '@/lib/utils.ts'

const DAY = 52
const ROOM = 152
const ROW = 68

const BLOCK: Record<Stay['status'], string> = {
  reservada: 'bg-reservado text-navy-950',
  ocupada: 'bg-ocupado text-white',
  checkout: 'bg-encerrada text-ink',
  bloqueado: 'blocked-fill text-white',
  cancelada: 'hidden',
}

export function ReservationMap({
  days,
  rooms,
  stays,
  onCreate,
  onOpen,
  onHousekeeping,
}: {
  days: string[]
  rooms: Room[]
  stays: Stay[]
  onCreate: (roomId: string, date: string) => void
  onOpen: (stayId: string) => void
  onHousekeeping: (room: Room) => void
}) {
  const today = todayISO()
  const width = ROOM + days.length * DAY
  return (
    <div className="map-scroll h-full" data-testid="map-scroll">
      <div style={{ width }}>
        <div className="sticky top-0 z-30 flex border-b border-line bg-navy-900 text-white">
          <div className="sticky left-0 z-40 flex items-end border-r border-white/10 bg-navy-900 px-3 pb-2" style={{ width: ROOM, height: 52 }}>
            Quarto
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={cn('flex shrink-0 flex-col items-center justify-center text-[11px]', day === today && 'bg-gold text-navy-950')}
              style={{ width: DAY, height: 52 }}
            >
              <span>{weekdayShort(day)}</span>
              <span className="text-sm font-semibold leading-none">{dayNumber(day)}</span>
            </div>
          ))}
        </div>
        {rooms.map((room) => {
          const roomStays = stays.filter((stay) => stay.roomId === room.id && stay.status !== 'cancelada')
          return (
            <div key={room.id} className="flex border-b border-line" style={{ height: ROW }}>
              <div
                className="sticky left-0 z-20 flex items-center gap-1 border-r border-line bg-card px-2 shadow-[4px_0_8px_-6px_rgba(7,20,34,0.45)]"
                style={{ width: ROOM }}
                data-testid={`room-${room.number}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-none text-navy-900 tabular-nums">{room.number}</p>
                  <p className="truncate text-[11px] text-muted">{room.name}</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border',
                    room.housekeeping === 'limpeza' ? 'border-gold bg-limpeza text-navy-900' : 'border-line bg-white text-muted',
                  )}
                  aria-label={room.housekeeping === 'limpeza' ? `Marcar ${room.name} como limpo` : `Enviar ${room.name} para limpeza`}
                  onClick={() => onHousekeeping(room)}
                >
                  <Brush className="h-4 w-4" />
                </button>
              </div>
              <div className="relative" style={{ width: days.length * DAY, height: ROW }}>
                <div className="absolute inset-0 flex">
                  {days.map((day) => {
                    const covered = roomStays.some((stay) => stay.checkIn <= day && stay.checkOut > day)
                    const cleaning = !covered && room.housekeeping === 'limpeza' && day === today
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={covered}
                        aria-label={covered ? undefined : `Nova reserva em ${room.name} no dia ${day.split('-').reverse().join('/')}`}
                        title={covered ? undefined : `Nova reserva · ${room.name}`}
                        onClick={() => onCreate(room.id, day)}
                        className={cn(
                          'group flex h-full shrink-0 items-center justify-center border-r border-line/80',
                          cleaning ? 'bg-limpeza' : isWeekend(day) ? 'bg-navy-900/4' : 'bg-white',
                          !covered && 'hover:bg-navy-800/10',
                        )}
                        style={{ width: DAY }}
                      >
                        {covered ? null : <span className="pointer-events-none hidden text-sm font-semibold text-navy-800 group-hover:block">+</span>}
                      </button>
                    )
                  })}
                </div>
                {roomStays.map((stay) => {
                  const geometry = blockGeometry(stay.checkIn, stay.checkOut, days, DAY)
                  if (!geometry) return null
                  const label = stay.guest ? `${stay.guest.rank.split(' ')[0]} ${stay.guest.fullName.split(' ').slice(-1)[0]}` : 'Manutenção'
                  return (
                    <button
                      key={stay.id}
                      type="button"
                      data-testid={`stay-${stay.id}`}
                      onClick={() => onOpen(stay.id)}
                      className={cn('absolute top-2 flex items-center overflow-hidden rounded px-2 text-left text-xs font-semibold', BLOCK[stay.status])}
                      style={{ left: geometry.left + 2, width: geometry.width, height: ROW - 16 }}
                      title={`${STATUS_LABEL[stay.status]} · ${label}`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function mapDays(start: string, end: string): string[] {
  return eachDate(start, end)
}
