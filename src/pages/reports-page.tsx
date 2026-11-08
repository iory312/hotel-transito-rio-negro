import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, formatDate, formatMonth, isISODate, monthBounds, parseISODate, todayISO } from '@/lib/dates.ts'
import { breakfastList, dayMovement, occupancy, peopleInHouse } from '@/lib/domain.ts'
import { toUserMessage } from '@/lib/errors.ts'
import type { BreakfastPerson, DayMovement, Occupancy, Stay } from '@/lib/types.ts'

export function ReportsPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [date, setDate] = useState(todayISO())
  const [movement, setMovement] = useState<DayMovement | null>(null)
  const [breakfast, setBreakfast] = useState<BreakfastPerson[]>([])
  const [usage, setUsage] = useState<Occupancy | null>(null)
  const [monthLabel, setMonthLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository || !isISODate(date)) return
    let cancelled = false
    setLoading(true)
    const anchor = parseISODate(date)
    const bounds = monthBounds(anchor.getUTCFullYear(), anchor.getUTCMonth())
    void repository
      .listReservations(addDays(bounds.start, -1), addDays(bounds.end, 1))
      .then(async (stays) => {
        const settings = await repository.getSettings()
        const rooms = await repository.listRooms()
        if (cancelled) return
        setMovement(dayMovement(stays, date))
        setBreakfast(breakfastList(stays, date, settings.exemptionAge))
        setUsage(occupancy(rooms.filter((room) => room.active).length, stays, bounds.start, bounds.end))
        setMonthLabel(formatMonth(anchor.getUTCFullYear(), anchor.getUTCMonth()))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível montar o relatório.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository, date])

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-auto p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink lg:hidden">Relatórios</h2>
          <p className="text-sm text-muted">Movimento do dia, café da manhã de quem passou a noite e ocupação do mês.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
            Data
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <Button className="no-print" variant="outline" onClick={() => window.print()}>Imprimir</Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Montando o relatório…</p> : null}
      {movement && movement.checkIns.length + movement.checkOuts.length + movement.inHouse.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum movimento neste dia.{' '}
          <Link to="/" className="font-semibold text-navy-800">Abrir o mapa</Link> para lançar uma reserva.
        </p>
      ) : null}
      {movement ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <MovementCard title="Entradas" empty="Nenhuma entrada nesta data." stays={movement.checkIns} />
          <MovementCard title="Saídas" empty="Nenhuma saída nesta data." stays={movement.checkOuts} />
          <MovementCard title="Na casa" empty="Nenhum hóspede alojado." stays={movement.inHouse} extra={(stay) => `${peopleInHouse(stay)} pessoa(s)`} />
        </div>
      ) : null}
      <section className="rounded-lg border border-line bg-card p-3">
        <h3 className="text-base font-semibold text-navy-900">Café da manhã · {formatDate(date)}</h3>
        <p className="text-sm text-muted">{breakfast.length} pessoa(s) que dormiram na casa e seguem até esta manhã.</p>
        {breakfast.length === 0 ? <p className="mt-3 text-sm text-muted">Ninguém para o café nesta manhã. O café conta quem dormiu na casa.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {breakfast.map((person, index) => (
            <li key={`${person.roomNumber}-${person.name}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">Q. {person.roomNumber}</span> {person.name}
                <span className="block text-muted">{person.role === 'titular' ? 'Titular' : person.age === null ? 'Dependente' : `Dependente · ${person.age} anos`}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      {usage ? (
        <section className="rounded-lg border border-line bg-card p-3">
          <h3 className="text-base font-semibold text-navy-900">Ocupação de {monthLabel}</h3>
          <p className="mt-1 text-3xl font-semibold text-navy-950">{usage.percent === null ? '—' : `${usage.percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</p>
          <p className="text-sm text-muted">
            {usage.roomNightsOccupied} noites ocupadas de {usage.roomNightsAvailable} disponíveis.
            {usage.roomNightsBlocked > 0 ? ` ${usage.roomNightsBlocked} noites bloqueadas ficam de fora da conta.` : ''}
          </p>
        </section>
      ) : null}
    </div>
  )
}

function MovementCard({ title, empty, stays, extra }: { title: string; empty: string; stays: Stay[]; extra?: (stay: Stay) => string }) {
  return (
    <section className="rounded-lg border border-line bg-card p-3">
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      <p className="text-2xl font-semibold">{stays.length}</p>
      {stays.length === 0 ? <p className="text-sm text-muted">{empty}</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {stays.map((stay) => (
          <li key={`${title}-${stay.id}`}>
            <Link to={`/reserva/${stay.id}`} className="block text-sm">
              <span className="font-semibold">Q. {stay.roomNumber} · {stay.guest?.rank} {stay.guest?.fullName}</span>
              {extra ? <span className="block text-muted">{extra(stay)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
