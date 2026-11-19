import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/confirm-dialog.tsx'
import { mapDays, ReservationMap } from '@/components/reservation-map.tsx'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input, controlClass } from '@/components/ui/input.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, currentMonth, formatDate, formatMonth, isISODate, monthBounds, shiftMonth, todayISO } from '@/lib/dates.ts'
import { dayMovement, peopleInHouse } from '@/lib/domain.ts'
import { capacityWarning, placementProblem, stayToInput, type Placement } from '@/lib/desk.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { BLOCK_KIND_LABEL } from '@/lib/labels.ts'
import type { BlockKind, Room, RoomCategory, Stay } from '@/lib/types.ts'

const LEGEND = [
  ['bg-white border border-line', 'Livre'],
  ['bg-pre', 'Pré-reserva'],
  ['bg-reservado', 'Confirmada'],
  ['bg-ocupado', 'Hospedado'],
  ['bg-limpeza', 'Limpeza'],
  ['block-manutencao', 'Manutenção'],
  ['block-interdicao', 'Interdição'],
  ['block-om', 'Reservado pela OM'],
  ['bg-encerrada border border-line', 'Finalizada'],
] as const

const BLOCK_KINDS = Object.keys(BLOCK_KIND_LABEL) as BlockKind[]

export function MapPage() {
  const { state } = useSession()
  const navigate = useNavigate()
  const repository = state.status === 'ready' ? state.repository : null
  const [cursor, setCursor] = useState(currentMonth)
  const [rooms, setRooms] = useState<Room[]>([])
  const [categories, setCategories] = useState<RoomCategory[]>([])
  const [categoryId, setCategoryId] = useState('todas')
  const [stays, setStays] = useState<Stay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [proposal, setProposal] = useState<null | { stay: Stay; placement: Placement; warning: string | null }>(null)
  const [rejectMessage, setRejectMessage] = useState<string | null>(null)
  const [blockMenu, setBlockMenu] = useState<Stay | null>(null)
  const [unblock, setUnblock] = useState<Stay | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockRoomId, setBlockRoomId] = useState('')
  const [blockIn, setBlockIn] = useState(todayISO())
  const [blockOut, setBlockOut] = useState(addDays(todayISO(), 1))
  const [blockKind, setBlockKind] = useState<BlockKind>('manutencao')
  const [blockReason, setBlockReason] = useState('')
  const bounds = monthBounds(cursor.year, cursor.monthIndex)
  const today = todayISO()
  const showsToday = today >= bounds.start && today < bounds.end
  const visibleRooms = categoryId === 'todas' ? rooms : rooms.filter((room) => room.categoryId === categoryId)
  const movement = dayMovement(stays, today)

  const load = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    setError(null)
    try {
      const [nextRooms, nextStays, nextCategories] = await Promise.all([
        repository.listRooms(),
        repository.listReservations(bounds.start, bounds.end),
        repository.listCategories(),
      ])
      setRooms(nextRooms)
      setStays(nextStays)
      setCategories(nextCategories)
      setBlockRoomId((current) => current || nextRooms[0]?.id || '')
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

  async function requestDrop(stay: Stay, placement: Placement) {
    if (!repository) return
    try {
      const around = await repository.listReservations(addDays(placement.checkIn, -1), addDays(placement.checkOut, 1))
      const problem = placementProblem({
        id: stay.id,
        status: stay.status,
        roomId: placement.roomId,
        checkIn: placement.checkIn,
        checkOut: placement.checkOut,
        rooms,
        reservations: around,
      })
      if (problem) {
        setRejectMessage(problem)
        return
      }
      const room = rooms.find((item) => item.id === placement.roomId)
      const category = categories.find((item) => item.id === room?.categoryId)
      setProposal({
        stay,
        placement,
        warning: stay.status === 'bloqueado' ? null : capacityWarning(peopleInHouse(stay), category?.capacity ?? null),
      })
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível validar a mudança.'))
    }
  }

  async function confirmDrop() {
    if (!repository || !proposal) return
    setSaving(true)
    setError(null)
    try {
      await repository.saveReservation(stayToInput(proposal.stay, proposal.placement))
      setProposal(null)
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível mover a reserva.'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmUnblock() {
    if (!repository || !unblock) return
    setSaving(true)
    setError(null)
    try {
      await repository.setStatus(unblock.id, 'cancelada')
      setUnblock(null)
      setBlockMenu(null)
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível desbloquear a UH.'))
    } finally {
      setSaving(false)
    }
  }

  async function createBlock() {
    if (!repository) return
    setSaving(true)
    setError(null)
    try {
      await repository.saveReservation({
        roomId: blockRoomId,
        checkIn: blockIn,
        checkOut: blockOut,
        dailyRate: 0,
        notes: '',
        kind: 'bloqueio',
        blockReason,
        blockKind,
        guest: null,
        dependents: [],
      })
      setBlockOpen(false)
      setBlockReason('')
      await load()
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível bloquear a UH.'))
    } finally {
      setSaving(false)
    }
  }

  const targetRoom = rooms.find((room) => room.id === proposal?.placement.roomId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line bg-card px-3 py-2 sm:px-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="min-w-0 flex-1 text-center text-sm font-semibold text-ink sm:min-w-44 sm:flex-none">{formatMonth(cursor.year, cursor.monthIndex)}</h2>
            <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCursor((value) => shiftMonth(value.year, value.monthIndex, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(currentMonth())}>
              Mês atual
            </Button>
          </div>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-navy-900 sm:max-w-xs">
            Categoria
            <select className={controlClass} value={categoryId} aria-label="Filtrar mapa por categoria" onChange={(event) => setCategoryId(event.target.value)}>
              <option value="todas">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setBlockOpen(true)}>
              Bloquear UH
            </Button>
            <Button asChild className="w-full sm:w-auto" data-testid="nova-reserva">
              <Link to="/reserva/nova">
                <Plus className="h-4 w-4" />
                Nova reserva
              </Link>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted" data-testid="map-room-count">
          {loading ? 'Carregando UHs…' : `${visibleRooms.length} UHs no mapa`}
          {showsToday && !loading ? ` · hoje ${movement.checkIns.length} entradas, ${movement.checkOuts.length} saídas, ${movement.inHouse.length} na casa` : ''}
          {' · arraste a reserva para outra UH ou data. As bordas mudam a entrada e a saída.'}
        </p>
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
      {!loading && !error && visibleRooms.length === 0 ? (
        <div className="m-3 rounded-md border border-dashed border-line bg-card p-4" data-testid="empty-state">
          <p className="text-sm font-semibold">Nenhuma UH nesta vista</p>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            Ajuste o filtro de categoria ou abra Quartos e confira se as UHs estão ativas.
          </p>
          <Button asChild className="mt-3">
            <Link to="/quartos">Abrir quartos</Link>
          </Button>
        </div>
      ) : null}
      {!loading && !error && visibleRooms.length > 0 && stays.length === 0 ? (
        <p className="border-b border-line bg-paper px-3 py-2 text-sm text-ink">
          Nenhuma estada neste mês. Use <span className="font-semibold">Nova reserva</span> ou clique num dia livre da UH.
        </p>
      ) : null}
      {!loading && !error && visibleRooms.length > 0 ? (
        <div className="min-h-0 flex-1">
          <ReservationMap
            days={mapDays(bounds.start, bounds.end)}
            rooms={visibleRooms}
            categories={categories}
            stays={stays}
            onCreate={(roomId, date) => navigate(`/reserva/nova?quarto=${roomId}&entrada=${date}`)}
            onOpen={(id) => {
              const stay = stays.find((item) => item.id === id)
              if (stay?.status === 'bloqueado') setBlockMenu(stay)
              else navigate(`/reserva/${id}`)
            }}
            onHousekeeping={(room) => void toggleCleaning(room)}
            onDrop={(stay, placement) => void requestDrop(stay, placement)}
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={proposal !== null}
        title="Confirmar mudança"
        description={
          proposal
            ? `Mover para a UH ${targetRoom?.number ?? '—'}, de ${formatDate(proposal.placement.checkIn)} a ${formatDate(proposal.placement.checkOut)}.${proposal.warning ? ` ${proposal.warning} A recepção pode manter mesmo assim.` : ''}`
            : ''
        }
        confirmLabel="Mover"
        pending={saving}
        onOpenChange={(open) => {
          if (!open) setProposal(null)
        }}
        onConfirm={() => void confirmDrop()}
      />
      <Dialog open={rejectMessage !== null} onOpenChange={(open) => { if (!open) setRejectMessage(null) }}>
        <DialogContent>
          <DialogTitle>Não foi possível mover</DialogTitle>
          <DialogDescription>{rejectMessage}</DialogDescription>
          <Button className="mt-4" onClick={() => setRejectMessage(null)}>Fechar</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={blockMenu !== null} onOpenChange={(open) => { if (!open) setBlockMenu(null) }}>
        <DialogContent>
          <DialogTitle>Bloqueio da UH {rooms.find((room) => room.id === blockMenu?.roomId)?.number}</DialogTitle>
          <DialogDescription>
            {blockMenu ? `${BLOCK_KIND_LABEL[blockMenu.blockKind || 'outro']} · ${blockMenu.blockReason}. De ${formatDate(blockMenu.checkIn)} a ${formatDate(blockMenu.checkOut)}.` : ''}
          </DialogDescription>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => blockMenu && navigate(`/reserva/${blockMenu.id}`)}>Abrir</Button>
            <Button variant="danger" onClick={() => { setUnblock(blockMenu); setBlockMenu(null) }}>Desbloquear</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={unblock !== null}
        title="Desbloquear UH"
        description="O período volta a aceitar reserva."
        confirmLabel="Desbloquear"
        pending={saving}
        onOpenChange={(open) => { if (!open) setUnblock(null) }}
        onConfirm={() => void confirmUnblock()}
      />
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogTitle>Bloquear UH</DialogTitle>
          <DialogDescription>O período fica indisponível. Reserva e bloqueio não se sobrepõem na mesma UH.</DialogDescription>
          <div className="mt-3 grid gap-3">
            <Field id="block-room" label="UH">
              <select id="block-room" className={controlClass} value={blockRoomId} onChange={(event) => setBlockRoomId(event.target.value)}>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>{room.number} · {room.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="block-in" label="Início">
                <Input id="block-in" type="date" value={blockIn} onChange={(event) => { if (isISODate(event.target.value)) setBlockIn(event.target.value) }} />
              </Field>
              <Field id="block-out" label="Fim">
                <Input id="block-out" type="date" value={blockOut} onChange={(event) => { if (isISODate(event.target.value)) setBlockOut(event.target.value) }} />
              </Field>
            </div>
            <Field id="block-kind" label="Motivo">
              <select id="block-kind" className={controlClass} value={blockKind} onChange={(event) => setBlockKind(event.target.value as BlockKind)}>
                {BLOCK_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{BLOCK_KIND_LABEL[kind]}</option>
                ))}
              </select>
            </Field>
            <Field id="block-detail" label="Detalhe">
              <Input id="block-detail" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: climatizador, infiltração, comitiva" />
            </Field>
            <Button onClick={() => void createBlock()} disabled={saving}>{saving ? 'Salvando…' : 'Bloquear período'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
