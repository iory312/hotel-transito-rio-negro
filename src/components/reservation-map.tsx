import { Brush } from 'lucide-react'
import { useRef, useState } from 'react'
import { blockGeometry } from '@/lib/domain.ts'
import { blockClass, moveStay, resizeStay, samePlacement, type Placement } from '@/lib/desk.ts'
import { dayNumber, eachDate, isWeekend, todayISO, weekdayShort } from '@/lib/dates.ts'
import { BLOCK_KIND_LABEL, STATUS_LABEL } from '@/lib/labels.ts'
import type { Room, RoomCategory, Stay } from '@/lib/types.ts'
import { cn } from '@/lib/utils.ts'

const DAY = 52
const ROOM = 152
const ROW = 68
const HEADER = 52

const BLOCK: Record<Stay['status'], string> = {
  pre_reserva: 'bg-pre text-navy-950',
  reservada: 'bg-reservado text-navy-950',
  ocupada: 'bg-ocupado text-white',
  checkout: 'bg-encerrada text-ink',
  bloqueado: 'text-white',
  cancelada: 'hidden',
}

interface DragState {
  stayId: string
  mode: 'move' | 'start' | 'end'
  pointerId: number
  startX: number
  startY: number
  grabDayIndex: number
  grabRoomIndex: number
  originRoomIndex: number
  moved: boolean
}

export function ReservationMap({
  days,
  rooms,
  categories,
  stays,
  onCreate,
  onOpen,
  onHousekeeping,
  onDrop,
}: {
  days: string[]
  rooms: Room[]
  categories: RoomCategory[]
  stays: Stay[]
  onCreate: (roomId: string, date: string) => void
  onOpen: (stayId: string) => void
  onHousekeeping: (room: Room) => void
  onDrop: (stay: Stay, placement: Placement) => void
}) {
  const today = todayISO()
  const width = ROOM + days.length * DAY
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<{ stayId: string; placement: Placement } | null>(null)
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))

  function cellAt(clientX: number, clientY: number): { dayIndex: number; roomIndex: number } | null {
    const grid = gridRef.current
    if (!grid) return null
    const rect = grid.getBoundingClientRect()
    const dayIndex = Math.floor((clientX - rect.left - ROOM) / DAY)
    const roomIndex = Math.floor((clientY - rect.top - HEADER) / ROW)
    if (dayIndex < 0 || roomIndex < 0 || dayIndex >= days.length || roomIndex >= rooms.length) return null
    return { dayIndex, roomIndex }
  }

  function placementFor(stay: Stay, drag: DragState, drop: { dayIndex: number; roomIndex: number }): Placement | null {
    if (drag.mode === 'move') {
      return moveStay({
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        roomIndex: drag.originRoomIndex,
        rooms,
        grabDayIndex: drag.grabDayIndex,
        grabRoomIndex: drag.grabRoomIndex,
        dropDayIndex: drop.dayIndex,
        dropRoomIndex: drop.roomIndex,
      })
    }
    return resizeStay({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      roomId: stay.roomId,
      edge: drag.mode === 'start' ? 'start' : 'end',
      dropDayIndex: drop.dayIndex,
      days,
    })
  }

  function beginDrag(event: React.PointerEvent<HTMLElement>, stay: Stay, mode: DragState['mode']) {
    if (event.button !== 0 || stay.status === 'cancelada' || stay.status === 'checkout') return
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      stayId: stay.id,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabDayIndex: cell.dayIndex,
      grabRoomIndex: cell.roomIndex,
      originRoomIndex: rooms.findIndex((room) => room.id === stay.roomId),
      moved: false,
    }
  }

  function trackDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const stay = stays.find((item) => item.id === drag.stayId)
    const cell = cellAt(event.clientX, event.clientY)
    if (!stay || !cell) {
      setPreview(null)
      return
    }
    if (Math.abs(event.clientX - drag.startX) > 6 || Math.abs(event.clientY - drag.startY) > 6) drag.moved = true
    const placement = placementFor(stay, drag, cell)
    setPreview(placement && drag.moved ? { stayId: stay.id, placement } : null)
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    const stay = stays.find((item) => item.id === drag.stayId)
    const cell = cellAt(event.clientX, event.clientY)
    const placement = stay && cell ? placementFor(stay, drag, cell) : null
    setPreview(null)
    if (!drag.moved) return
    suppressClick.current = true
    if (!stay || !placement || samePlacement(stay, placement)) return
    onDrop(stay, placement)
  }

  return (
    <div className="map-scroll h-full" data-testid="map-scroll">
      <div ref={gridRef} style={{ width }}>
        <div className="sticky top-0 z-30 flex border-b border-line bg-navy-900 text-white">
          <div className="sticky left-0 z-40 flex items-end border-r border-white/10 bg-navy-900 px-3 pb-2 text-sm" style={{ width: ROOM, height: HEADER }}>
            UH
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={cn('flex shrink-0 flex-col items-center justify-center text-[11px]', day === today && 'bg-gold text-navy-950')}
              style={{ width: DAY, height: HEADER }}
            >
              <span>{weekdayShort(day)}</span>
              <span className="text-sm font-semibold leading-none">{dayNumber(day)}</span>
            </div>
          ))}
        </div>
        {rooms.map((room) => {
          const roomStays = stays.filter((stay) => stay.roomId === room.id && stay.status !== 'cancelada')
          const category = room.categoryId ? categoryName.get(room.categoryId) : undefined
          return (
            <div key={room.id} className="flex border-b border-line" style={{ height: ROW }}>
              <div
                className="sticky left-0 z-20 flex items-center gap-1 border-r border-line bg-card px-2 shadow-[4px_0_8px_-6px_rgba(7,20,34,0.45)]"
                style={{ width: ROOM }}
                data-testid={`room-${room.number}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-none text-navy-900 tabular-nums">{room.number}</p>
                  <p className="truncate text-[11px] text-muted">{category ?? room.name}</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border',
                    room.housekeeping === 'limpeza' ? 'border-gold bg-limpeza text-navy-900' : 'border-line bg-white text-muted',
                  )}
                  aria-label={room.housekeeping === 'limpeza' ? `Marcar UH ${room.number} como limpa` : `Enviar UH ${room.number} para limpeza`}
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
                        aria-label={covered ? undefined : `Nova reserva na UH ${room.number} no dia ${day.split('-').reverse().join('/')}`}
                        title={covered ? undefined : `Nova reserva · UH ${room.number}`}
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
                  const dragging = preview?.stayId === stay.id
                  const label = stay.guest
                    ? `${stay.guest.rank.split(' ')[0]} ${stay.guest.fullName.split(' ').slice(-1)[0]}`
                    : BLOCK_KIND_LABEL[stay.blockKind || 'outro']
                  const closed = stay.status === 'checkout'
                  return (
                    <div
                      key={stay.id}
                      className={cn('stay-block absolute top-2', dragging && 'opacity-40')}
                      style={{ left: geometry.left + 2, width: geometry.width, height: ROW - 16 }}
                    >
                      {closed ? null : (
                        <button
                          type="button"
                          aria-label={`Alterar a entrada de ${label}`}
                          className="absolute inset-y-0 left-0 z-10 w-3 cursor-ew-resize rounded-l"
                          onPointerDown={(event) => beginDrag(event, stay, 'start')}
                          onPointerMove={trackDrag}
                          onPointerUp={finishDrag}
                          onPointerCancel={finishDrag}
                        />
                      )}
                      <button
                        type="button"
                        data-testid={`stay-${stay.id}`}
                        className={cn(
                          'absolute inset-y-0 right-3 left-3 flex items-center overflow-hidden rounded px-1 text-left text-xs font-semibold',
                          closed ? 'cursor-pointer' : 'cursor-grab',
                          BLOCK[stay.status],
                          stay.status === 'bloqueado' && blockClass(stay.blockKind),
                        )}
                        title={`${STATUS_LABEL[stay.status]} · ${label}`}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false
                            return
                          }
                          onOpen(stay.id)
                        }}
                        onPointerDown={(event) => beginDrag(event, stay, 'move')}
                        onPointerMove={trackDrag}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                      >
                        <span className="truncate">{label}</span>
                      </button>
                      {closed ? null : (
                        <button
                          type="button"
                          aria-label={`Alterar a saída de ${label}`}
                          className="absolute inset-y-0 right-0 z-10 w-3 cursor-ew-resize rounded-r"
                          onPointerDown={(event) => beginDrag(event, stay, 'end')}
                          onPointerMove={trackDrag}
                          onPointerUp={finishDrag}
                          onPointerCancel={finishDrag}
                        />
                      )}
                    </div>
                  )
                })}
                {preview && preview.placement.roomId === room.id
                  ? (() => {
                      const geometry = blockGeometry(preview.placement.checkIn, preview.placement.checkOut, days, DAY)
                      const stay = stays.find((item) => item.id === preview.stayId)
                      if (!geometry || !stay) return null
                      return (
                        <div
                          className={cn(
                            'pointer-events-none absolute top-2 rounded opacity-80 ring-2 ring-gold',
                            BLOCK[stay.status],
                            stay.status === 'bloqueado' && blockClass(stay.blockKind),
                          )}
                          style={{ left: geometry.left + 2, width: geometry.width, height: ROW - 16 }}
                        />
                      )
                    })()
                  : null}
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
