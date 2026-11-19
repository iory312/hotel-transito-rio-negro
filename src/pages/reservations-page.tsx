import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input, controlClass } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, formatDate, monthBounds, parseISODate, todayISO } from '@/lib/dates.ts'
import { buildBill } from '@/lib/domain.ts'
import { billTotal, filterReservations, paymentStanding, type ReservationSort } from '@/lib/desk.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { PAYMENT_STATUS_LABEL, STATUS_LABEL } from '@/lib/labels.ts'
import { formatMoney } from '@/lib/money.ts'
import type { ReservationStatus, Stay } from '@/lib/types.ts'
import { cn } from '@/lib/utils.ts'

const FILTERS: { value: '' | ReservationStatus; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'pre_reserva', label: 'Pré-reserva' },
  { value: 'reservada', label: 'Confirmada' },
  { value: 'ocupada', label: 'Hospedado' },
  { value: 'checkout', label: 'Finalizada' },
  { value: 'cancelada', label: 'Cancelada' },
]

const SORTS: { value: ReservationSort; label: string }[] = [
  { value: 'checkIn', label: 'Entrada' },
  { value: 'guest', label: 'Hóspede' },
  { value: 'room', label: 'UH' },
  { value: 'status', label: 'Status' },
  { value: 'total', label: 'Total' },
]

export function ReservationsPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const today = todayISO()
  const initial = monthBounds(parseISODate(today).getUTCFullYear(), parseISODate(today).getUTCMonth())
  const [from, setFrom] = useState(initial.start)
  const [to, setTo] = useState(addDays(initial.end, -1))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'' | ReservationStatus>('')
  const [sort, setSort] = useState<ReservationSort>('checkIn')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [stays, setStays] = useState<Stay[]>([])
  const [exemptionAge, setExemptionAge] = useState(6)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelStay, setCancelStay] = useState<Stay | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    setLoading(true)
    void Promise.all([
      repository.listReservations(from, addDays(to, 1), { includeCancelled: true }),
      repository.getSettings(),
    ])
      .then(([nextStays, settings]) => {
        if (cancelled) return
        setStays(nextStays)
        setExemptionAge(settings.exemptionAge)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível carregar as reservas.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository, from, to])

  const rows = useMemo(
    () =>
      filterReservations(stays, {
        query,
        statuses: status ? [status] : [],
        from,
        toExclusive: addDays(to, 1),
        sort,
        direction,
        exemptionAge,
      }),
    [stays, query, status, from, to, sort, direction, exemptionAge],
  )

  function toggleSort(next: ReservationSort) {
    if (sort === next) setDirection((value) => (value === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(next)
      setDirection('asc')
    }
  }

  async function confirmCancel() {
    if (!repository || !cancelStay) return
    setSaving(true)
    setError(null)
    try {
      await repository.cancelReservation(cancelStay.id, reason)
      setNotice('Reserva cancelada.')
      setCancelStay(null)
      setReason('')
      const next = await repository.listReservations(from, addDays(to, 1), { includeCancelled: true })
      setStays(next)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível cancelar a reserva.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-auto" data-testid="reservations-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy-900 lg:hidden">Reservas</h2>
            <p className="text-sm text-muted">Busca por nome, NIP ou número da UH. O período usa a sobreposição da estada.</p>
          </div>
          <Button asChild>
            <Link to="/reserva/nova">Nova reserva</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
            Busca
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, NIP ou UH" aria-label="Buscar reserva" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
            Status
            <select className={controlClass} value={status} aria-label="Filtrar por status" onChange={(event) => setStatus(event.target.value as '' | ReservationStatus)}>
              {FILTERS.map((item) => (
                <option key={item.label} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
            De
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Início do período" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
            Até
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Fim do período" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ordenação">
          {SORTS.map((item) => (
            <Button key={item.value} size="sm" variant={sort === item.value ? 'default' : 'outline'} onClick={() => toggleSort(item.value)} aria-pressed={sort === item.value}>
              {item.label}{sort === item.value ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
            </Button>
          ))}
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
        {loading ? <p className="text-sm text-muted">Carregando reservas…</p> : null}
        {!loading && rows.length === 0 ? <p className="text-sm text-muted">Nenhuma reserva neste filtro. Amplie o período ou limpe a busca.</p> : null}
        <div className="flex flex-col gap-2 md:hidden">
          {rows.map((stay) => (
            <ReservationCard key={stay.id} stay={stay} exemptionAge={exemptionAge} onCancel={() => { setCancelStay(stay); setReason('') }} />
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-md border border-line bg-card md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Reservas do período</caption>
            <thead className="border-b border-line bg-paper text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">UH</th>
                <th className="px-3 py-2 font-semibold">Hóspede</th>
                <th className="px-3 py-2 font-semibold">NIP</th>
                <th className="px-3 py-2 font-semibold">Período</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Pagamento</th>
                <th className="px-3 py-2 font-semibold">Total</th>
                <th className="px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((stay) => {
                const bill = buildBill({
                  checkIn: stay.checkIn,
                  checkOut: stay.checkOut,
                  dailyRate: stay.dailyRate,
                  exemptionAge,
                  titularName: stay.guest?.fullName ?? '',
                  dependents: stay.dependents,
                  payments: stay.payments,
                })
                const standing = paymentStanding(bill)
                const canCancel = stay.status === 'pre_reserva' || stay.status === 'reservada' || stay.status === 'ocupada'
                return (
                  <tr key={stay.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-semibold tabular-nums">{stay.roomNumber}</td>
                    <td className="px-3 py-2">{stay.guest?.fullName}</td>
                    <td className="px-3 py-2">{stay.guest?.nip}</td>
                    <td className="px-3 py-2">{formatDate(stay.checkIn)} – {formatDate(stay.checkOut)}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[stay.status]}</td>
                    <td className={cn('px-3 py-2 font-semibold', standing === 'pago' ? 'text-ok' : standing === 'pendente' ? 'text-danger' : 'text-navy-800')}>{PAYMENT_STATUS_LABEL[standing]}</td>
                    <td className="px-3 py-2">{formatMoney(billTotal(stay, exemptionAge))}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Link to={`/reserva/${stay.id}`} className="font-semibold text-navy-800">Abrir</Link>
                        {canCancel ? (
                          <button type="button" className="font-semibold text-danger" onClick={() => { setCancelStay(stay); setReason('') }}>
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={cancelStay !== null} onOpenChange={(open) => { if (!open) setCancelStay(null) }}>
        <DialogContent>
          <DialogTitle>Cancelar reserva</DialogTitle>
          <DialogDescription>
            {cancelStay ? `${cancelStay.guest?.fullName ?? 'Hóspede'} · UH ${cancelStay.roomNumber}. O quarto volta a ficar livre neste período.` : ''}
          </DialogDescription>
          <label className="mt-3 flex flex-col gap-1 text-sm font-semibold text-navy-900" htmlFor="cancel-reason">
            Motivo
            <Textarea id="cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: viagem adiada pela OM" />
          </label>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setCancelStay(null)} disabled={saving}>Voltar</Button>
            <Button variant="danger" onClick={() => void confirmCancel()} disabled={saving}>{saving ? 'Salvando…' : 'Cancelar reserva'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReservationCard({ stay, exemptionAge, onCancel }: { stay: Stay; exemptionAge: number; onCancel: () => void }) {
  const bill = buildBill({
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    dailyRate: stay.dailyRate,
    exemptionAge,
    titularName: stay.guest?.fullName ?? '',
    dependents: stay.dependents,
    payments: stay.payments,
  })
  const standing = paymentStanding(bill)
  const canCancel = stay.status === 'pre_reserva' || stay.status === 'reservada' || stay.status === 'ocupada'
  return (
    <article className="rounded-md border border-line bg-card p-3">
      <p className="font-semibold">UH {stay.roomNumber} · {stay.guest?.fullName}</p>
      <p className="text-sm text-muted">{stay.guest?.nip} · {formatDate(stay.checkIn)} a {formatDate(stay.checkOut)}</p>
      <p className="mt-1 text-sm">{STATUS_LABEL[stay.status]} · {PAYMENT_STATUS_LABEL[standing]} · {formatMoney(bill.total)}</p>
      <div className="mt-2 flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={`/reserva/${stay.id}`}>Abrir</Link>
        </Button>
        {canCancel ? <Button size="sm" variant="danger" onClick={onCancel}>Cancelar</Button> : null}
      </div>
    </article>
  )
}
