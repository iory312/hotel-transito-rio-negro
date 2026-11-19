import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, formatDate, formatMonth, isISODate, monthBounds, parseISODate, todayISO } from '@/lib/dates.ts'
import { breakfastList, dayMovement, occupancy, peopleInHouse } from '@/lib/domain.ts'
import { csvNumber, guestsByOm, revenueReport, toCsv, type OmRow, type RevenueRow } from '@/lib/desk.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { STATUS_LABEL } from '@/lib/labels.ts'
import { formatMoney } from '@/lib/money.ts'
import type { BreakfastPerson, DayMovement, Occupancy, Stay } from '@/lib/types.ts'

export function ReportsPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const today = todayISO()
  const opening = monthBounds(parseISODate(today).getUTCFullYear(), parseISODate(today).getUTCMonth())
  const [date, setDate] = useState(today)
  const [from, setFrom] = useState(opening.start)
  const [to, setTo] = useState(addDays(opening.end, -1))
  const [movement, setMovement] = useState<DayMovement | null>(null)
  const [breakfast, setBreakfast] = useState<BreakfastPerson[]>([])
  const [usage, setUsage] = useState<Occupancy | null>(null)
  const [monthLabel, setMonthLabel] = useState('')
  const [revenue, setRevenue] = useState<{ expected: number; received: number; rows: RevenueRow[] } | null>(null)
  const [organizations, setOrganizations] = useState<OmRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository || !isISODate(date) || !isISODate(from) || !isISODate(to) || to < from) return
    let cancelled = false
    setLoading(true)
    const anchor = parseISODate(date)
    const bounds = monthBounds(anchor.getUTCFullYear(), anchor.getUTCMonth())
    const periodEnd = addDays(to, 1)
    const spanStart = bounds.start < from ? bounds.start : from
    const spanEnd = bounds.end > periodEnd ? bounds.end : periodEnd
    void repository
      .listReservations(addDays(spanStart, -1), addDays(spanEnd, 1), { includeCancelled: true })
      .then(async (stays) => {
        const settings = await repository.getSettings()
        const rooms = await repository.listRooms()
        if (cancelled) return
        setMovement(dayMovement(stays, date))
        setBreakfast(breakfastList(stays, date, settings.exemptionAge))
        setUsage(occupancy(rooms.filter((room) => room.active).length, stays, from, periodEnd))
        setRevenue(revenueReport(stays, from, periodEnd, settings.exemptionAge))
        setOrganizations(guestsByOm(stays, from, periodEnd))
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
  }, [repository, date, from, to])

  const periodReady = isISODate(from) && isISODate(to) && to >= from

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-auto p-3 sm:p-4" data-testid="reports-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink lg:hidden">Relatórios</h2>
          <p className="text-sm text-muted">Ocupação, receita prevista e recebida, hóspedes por OM e o movimento do dia.</p>
        </div>
        <Button className="no-print" variant="outline" onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="grid gap-3 rounded-md border border-line bg-card p-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
          Período de
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
          Até
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {!periodReady ? <p className="text-sm text-danger">O fim do período precisa ser igual ou posterior ao início.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Montando o relatório…</p> : null}
      {usage ? (
        <section className="rounded-lg border border-line bg-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-navy-900">Ocupação de {formatDate(from)} a {formatDate(to)}</h3>
              <p className="mt-1 text-3xl font-semibold text-navy-950">{usage.percent === null ? '—' : `${usage.percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</p>
              <p className="text-sm text-muted">
                {usage.roomNightsOccupied} noites ocupadas de {usage.roomNightsAvailable} disponíveis.
                {usage.roomNightsBlocked > 0 ? ` ${usage.roomNightsBlocked} noites bloqueadas ficam de fora da conta.` : ''}
              </p>
            </div>
            <Button
              className="no-print"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  'ocupacao.csv',
                  toCsv(
                    ['Início', 'Fim', 'Noites', 'Disponíveis', 'Ocupadas', 'Bloqueadas', 'Percentual'],
                    [[
                      from,
                      to,
                      String(usage.nights),
                      String(usage.roomNightsAvailable),
                      String(usage.roomNightsOccupied),
                      String(usage.roomNightsBlocked),
                      usage.percent === null ? '' : csvNumber(usage.percent),
                    ]],
                  ),
                )
              }
            >
              Exportar CSV
            </Button>
          </div>
        </section>
      ) : null}
      {revenue ? (
        <section className="rounded-lg border border-line bg-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-navy-900">Diárias no período</h3>
              <p className="mt-1 text-sm text-muted">Previsto é a diária × noites do período × pagantes. Recebido soma os pagamentos lançados nessas datas.</p>
            </div>
            <Button className="no-print" variant="outline" size="sm" onClick={() => downloadCsv('receita.csv', revenueCsv(revenue.rows))}>
              Exportar CSV
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-muted">Previsto</dt>
              <dd className="text-2xl font-semibold text-navy-950">{formatMoney(revenue.expected)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Recebido</dt>
              <dd className="text-2xl font-semibold text-navy-950">{formatMoney(revenue.received)}</dd>
            </div>
          </dl>
          {revenue.rows.length === 0 ? <p className="mt-3 text-sm text-muted">Nenhuma diária neste período.</p> : null}
          <ul className="mt-3 divide-y divide-line">
            {revenue.rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">UH {row.roomNumber} · {row.guest}</span>
                  <span className="block text-muted">{row.om} · {STATUS_LABEL[row.status]} · {row.nights} noite(s)</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{formatMoney(row.expected)}</span>
                  <span className="block text-muted">recebido {formatMoney(row.received)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="rounded-lg border border-line bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-base font-semibold text-navy-900">Hóspedes por OM</h3>
          <Button className="no-print" variant="outline" size="sm" onClick={() => downloadCsv('hospedes-por-om.csv', omCsv(organizations))}>
            Exportar CSV
          </Button>
        </div>
        {organizations.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma estada de hóspede neste período.</p> : null}
        <ul className="mt-2 divide-y divide-line">
          {organizations.map((row) => (
            <li key={row.om} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold">{row.om}</span>
              <span className="text-muted">{row.guests} hóspede(s) · {row.stays} estada(s)</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-navy-900">
          Dia do movimento
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>
      {movement && movement.checkIns.length + movement.checkOuts.length + movement.inHouse.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum movimento neste dia.{' '}
          <Link to="/mapa" className="font-semibold text-navy-800">Abrir o mapa</Link> para lançar uma reserva.
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
        <p className="text-sm text-muted">{breakfast.length} pessoa(s) que dormiram na casa e seguem até esta manhã. Referência de {monthLabel}.</p>
        {breakfast.length === 0 ? <p className="mt-3 text-sm text-muted">Ninguém para o café nesta manhã. O café conta quem dormiu na casa.</p> : null}
        <ul className="mt-3 divide-y divide-line">
          {breakfast.map((person, index) => (
            <li key={`${person.roomNumber}-${person.name}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-semibold">UH {person.roomNumber}</span> {person.name}
                <span className="block text-muted">{person.role === 'titular' ? 'Titular' : person.age === null ? 'Dependente' : `Dependente · ${person.age} anos`}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
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
              <span className="font-semibold">UH {stay.roomNumber} · {stay.guest?.rank} {stay.guest?.fullName}</span>
              {extra ? <span className="block text-muted">{extra(stay)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function revenueCsv(rows: RevenueRow[]): string {
  return toCsv(
    ['UH', 'Hóspede', 'OM', 'Situação', 'Noites', 'Previsto', 'Recebido'],
    rows.map((row) => [row.roomNumber, row.guest, row.om, STATUS_LABEL[row.status], String(row.nights), csvNumber(row.expected), csvNumber(row.received)]),
  )
}

function omCsv(rows: OmRow[]): string {
  return toCsv(
    ['OM', 'Hóspedes', 'Estadias'],
    rows.map((row) => [row.om, String(row.guests), String(row.stays)]),
  )
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
