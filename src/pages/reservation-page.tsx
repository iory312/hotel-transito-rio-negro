import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BillingCard } from '@/components/billing-card.tsx'
import { DependentEditor, type DependentRow } from '@/components/dependent-editor.tsx'
import { ConfirmDialog } from '@/components/confirm-dialog.tsx'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input, controlClass } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useSession } from '@/context/session.tsx'
import { addDays, formatDate, isISODate, todayISO } from '@/lib/dates.ts'
import { buildBill } from '@/lib/domain.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { PAYMENT_LABEL, RANKS, STATUS_LABEL } from '@/lib/labels.ts'
import { formatMoney, formatRateInput, parseDailyRate, parsePaymentAmount } from '@/lib/money.ts'
import type { Guest, PaymentMethod, Room, Settings, Stay, StayKind } from '@/lib/types.ts'

const METHODS = Object.keys(PAYMENT_LABEL) as PaymentMethod[]

export function ReservationPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [rooms, setRooms] = useState<Room[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [stay, setStay] = useState<Stay | null>(null)
  const [kind, setKind] = useState<StayKind>('hospedagem')
  const [roomId, setRoomId] = useState('')
  const [checkIn, setCheckIn] = useState(todayISO())
  const [checkOut, setCheckOut] = useState(addDays(todayISO(), 1))
  const [rateText, setRateText] = useState('')
  const [notes, setNotes] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [guestId, setGuestId] = useState('')
  const [fullName, setFullName] = useState('')
  const [rank, setRank] = useState('')
  const [nip, setNip] = useState('')
  const [om, setOm] = useState('')
  const [phone, setPhone] = useState('')
  const [guestNotes, setGuestNotes] = useState('')
  const [dependents, setDependents] = useState<DependentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [finderOpen, setFinderOpen] = useState(false)
  const [finderQuery, setFinderQuery] = useState('')
  const [finderResults, setFinderResults] = useState<Guest[]>([])
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix')
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [paymentNotes, setPaymentNotes] = useState('')
  const [confirm, setConfirm] = useState<null | { title: string; description: string; label: string; run: () => Promise<void> }>(null)

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [nextRooms, nextSettings, nextStay] = await Promise.all([
          repository!.listRooms(),
          repository!.getSettings(),
          id ? repository!.getReservation(id) : Promise.resolve(null),
        ])
        if (cancelled) return
        if (id && !nextStay) {
          setError('Reserva não encontrada.')
          setLoading(false)
          return
        }
        setRooms(nextRooms)
        setSettings(nextSettings)
        setStay(nextStay)
        if (nextStay) {
          setKind(nextStay.status === 'bloqueado' ? 'bloqueio' : 'hospedagem')
          setRoomId(nextStay.roomId)
          setCheckIn(nextStay.checkIn)
          setCheckOut(nextStay.checkOut)
          setRateText(nextStay.status === 'bloqueado' ? '' : formatRateInput(nextStay.dailyRate))
          setNotes(nextStay.notes)
          setBlockReason(nextStay.blockReason)
          setGuestId(nextStay.guest?.id ?? '')
          setFullName(nextStay.guest?.fullName ?? '')
          setRank(nextStay.guest?.rank ?? '')
          setNip(nextStay.guest?.nip ?? '')
          setOm(nextStay.guest?.om ?? '')
          setPhone(nextStay.guest?.phone ?? '')
          setGuestNotes(nextStay.guest?.notes ?? '')
          setDependents(nextStay.dependents.map((dependent) => ({ key: dependent.id, fullName: dependent.fullName, birthDate: dependent.birthDate })))
        } else {
          const quarto = searchParams.get('quarto')
          const entrada = searchParams.get('entrada')
          setRoomId(quarto && nextRooms.some((room) => room.id === quarto) ? quarto : (nextRooms[0]?.id ?? ''))
          if (entrada && isISODate(entrada)) {
            setCheckIn(entrada)
            setCheckOut(addDays(entrada, 1))
          }
        }
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível carregar a reserva.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [repository, id, searchParams])

  useEffect(() => {
    if (!finderOpen || !repository) return
    const timer = window.setTimeout(() => {
      void repository.listGuests(finderQuery).then(setFinderResults).catch(() => setFinderResults([]))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [finderOpen, finderQuery, repository])

  const locked = stay?.status === 'checkout' || stay?.status === 'cancelada'
  const rate = parseDailyRate(rateText)
  const bill = useMemo(
    () =>
      buildBill({
        checkIn,
        checkOut,
        dailyRate: kind === 'bloqueio' ? 0 : rate,
        exemptionAge: settings?.exemptionAge ?? 6,
        titularName: kind === 'bloqueio' ? '' : fullName,
        dependents: kind === 'bloqueio' ? [] : dependents,
        payments: stay?.payments ?? [],
      }),
    [checkIn, checkOut, kind, rate, settings?.exemptionAge, fullName, dependents, stay?.payments],
  )

  async function reload(stayId: string) {
    if (!repository) return
    const next = await repository.getReservation(stayId)
    setStay(next)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!repository || locked) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const savedId = await repository.saveReservation({
        id: stay?.id,
        roomId,
        checkIn,
        checkOut,
        dailyRate: kind === 'bloqueio' ? 0 : rate,
        notes,
        kind,
        blockReason,
        guest:
          kind === 'bloqueio'
            ? null
            : { id: guestId || undefined, fullName, rank, nip, om, phone, notes: guestNotes },
        dependents: kind === 'bloqueio' ? [] : dependents.map(({ fullName: name, birthDate }) => ({ fullName: name, birthDate })),
      })
      setNotice(stay ? 'Alterações registradas.' : 'Reserva registrada.')
      if (!stay) navigate(`/reserva/${savedId}`, { replace: true })
      else await reload(savedId)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar a reserva.'))
    } finally {
      setSaving(false)
    }
  }

  async function runStatus(status: 'ocupada' | 'checkout' | 'cancelada') {
    if (!repository || !stay) return
    setSaving(true)
    setError(null)
    try {
      await repository.setStatus(stay.id, status)
      await reload(stay.id)
      setNotice(status === 'ocupada' ? 'Check-in registrado.' : status === 'checkout' ? 'Check-out registrado.' : 'Registro cancelado.')
      setConfirm(null)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível atualizar o status.'))
    } finally {
      setSaving(false)
    }
  }

  async function addPayment() {
    if (!repository || !stay) return
    const amount = parsePaymentAmount(paymentAmount)
    if (amount === null) {
      setError('Informe um valor de pagamento válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await repository.addPayment({ reservationId: stay.id, amount, method: paymentMethod, paidAt: paymentDate, notes: paymentNotes })
      setPaymentAmount('')
      setPaymentNotes('')
      await reload(stay.id)
      setNotice('Pagamento registrado.')
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível registrar o pagamento.'))
    } finally {
      setSaving(false)
    }
  }

  async function chooseGuest(guest: Guest) {
    setGuestId(guest.id)
    setFullName(guest.fullName)
    setRank(guest.rank)
    setNip(guest.nip)
    setOm(guest.om)
    setPhone(guest.phone)
    setGuestNotes(guest.notes)
    setFinderOpen(false)
    if (!repository) return
    try {
      const profile = await repository.getGuest(guest.id)
      if (profile && profile.dependents.length > 0) {
        setDependents(profile.dependents.map((dependent) => ({ key: dependent.id, fullName: dependent.fullName, birthDate: dependent.birthDate })))
      }
    } catch {
      setError(null)
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted">Carregando a reserva…</p>
  if (!settings) {
    return (
      <div className="p-4" role="alert">
        <p>{error ?? 'Não foi possível carregar a reserva.'}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 lg:order-1">
        <div className="sticky top-0 z-10 -mx-3 flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2 sm:-mx-4 sm:px-4">
          <Link to="/" className="text-sm font-semibold text-navy-800">
            Mapa
          </Link>
          {stay ? <span className="rounded-md bg-navy-900 px-2 py-1 text-xs font-semibold text-white">{STATUS_LABEL[stay.status]}</span> : <span className="text-sm font-semibold">{kind === 'bloqueio' ? 'Novo bloqueio' : 'Nova reserva'}</span>}
          {!locked ? (
            <Button type="submit" form="stay-form" size="sm" className="ml-auto" disabled={saving} data-testid="save-reservation-top">
              {saving ? 'Salvando…' : stay ? 'Salvar' : 'Registrar'}
            </Button>
          ) : null}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-navy-900">{stay ? (stay.guest?.fullName ?? 'Reserva') : 'Nova reserva'}</h2>
        {error ? (
          <p className="mt-3 rounded-md border border-danger/30 bg-white px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="mt-3 rounded-md bg-gold-soft px-3 py-2 text-sm text-navy-950">{notice}</p> : null}
        {stay && stay.status === 'reservada' ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button onClick={() => void runStatus('ocupada')} disabled={saving}>Fazer check-in</Button>
            <Button variant="outline" onClick={() => setConfirm({ title: 'Cancelar reserva', description: 'O quarto volta a ficar livre neste período.', label: 'Cancelar reserva', run: () => runStatus('cancelada') })}>Cancelar reserva</Button>
          </div>
        ) : null}
        {stay && stay.status === 'ocupada' ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button onClick={() => void runStatus('checkout')} disabled={saving}>Fazer check-out</Button>
            <Button variant="outline" onClick={() => setConfirm({ title: 'Cancelar hospedagem', description: 'A saída antecipada envia o quarto para limpeza.', label: 'Cancelar hospedagem', run: () => runStatus('cancelada') })}>Cancelar hospedagem</Button>
          </div>
        ) : null}
        {stay && stay.status === 'bloqueado' ? (
          <Button className="mt-3" variant="outline" onClick={() => setConfirm({ title: 'Encerrar bloqueio', description: 'O período volta a aceitar reserva.', label: 'Encerrar bloqueio', run: () => runStatus('cancelada') })}>Encerrar bloqueio</Button>
        ) : null}
        <form id="stay-form" onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
          {!stay ? (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={kind === 'hospedagem' ? 'default' : 'outline'} onClick={() => setKind('hospedagem')}>Hospedagem</Button>
              <Button type="button" variant={kind === 'bloqueio' ? 'default' : 'outline'} onClick={() => setKind('bloqueio')}>Bloqueio</Button>
            </div>
          ) : null}
          <Field id="room" label="Quarto">
            <select id="room" className={controlClass} value={roomId} disabled={locked} onChange={(event) => setRoomId(event.target.value)}>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>{room.number} · {room.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="check-in" label="Entrada">
              <Input id="check-in" type="date" required value={checkIn} disabled={locked} onChange={(event) => { if (event.target.value === '' || isISODate(event.target.value)) setCheckIn(event.target.value) }} />
            </Field>
            <Field id="check-out" label="Saída">
              <Input id="check-out" type="date" required value={checkOut} disabled={locked} onChange={(event) => { if (event.target.value === '' || isISODate(event.target.value)) setCheckOut(event.target.value) }} />
            </Field>
          </div>
          {kind === 'bloqueio' ? (
            <Field id="reason" label="Motivo do bloqueio">
              <Input id="reason" value={blockReason} disabled={locked} onChange={(event) => setBlockReason(event.target.value)} placeholder="Ex.: manutenção do climatizador" />
            </Field>
          ) : (
            <Field id="rate" label="Diária" hint="Informe o valor vigente. A tarifa não fica gravada no sistema como tabela.">
              <Input id="rate" inputMode="decimal" value={rateText} disabled={locked} onChange={(event) => setRateText(event.target.value)} placeholder="Valor da diária" data-testid="rate-input" />
            </Field>
          )}
          <Field id="notes" label="Observações da estada">
            <Textarea id="notes" value={notes} disabled={locked} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {kind === 'hospedagem' ? (
            <fieldset className="rounded-lg border border-line bg-card p-3" disabled={locked}>
              <legend className="px-1 text-sm font-semibold text-navy-900">Titular militar</legend>
              <p className="mt-1 text-sm text-muted">Pode preencher aqui ou cadastrar antes em Hóspedes. O titular sempre paga.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="outline" onClick={() => setFinderOpen(true)}>Buscar militar já cadastrado</Button>
                <Button type="button" variant="ghost" onClick={() => { setGuestId(''); setFullName(''); setRank(''); setNip(''); setOm(''); setPhone(''); setGuestNotes('') }}>Limpar titular</Button>
              </div>
              <div className="mt-3 grid gap-3">
                <Field id="full-name" label="Nome"><Input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></Field>
                <Field id="rank" label="Posto ou graduação">
                  <Input id="rank" list="postos" value={rank} onChange={(event) => setRank(event.target.value)} />
                  <datalist id="postos">{RANKS.map((item) => <option key={item} value={item} />)}</datalist>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="nip" label="NIP"><Input id="nip" value={nip} onChange={(event) => setNip(event.target.value)} autoComplete="off" spellCheck={false} /></Field>
                  <Field id="phone" label="Telefone"><Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></Field>
                </div>
                <Field id="om" label="Organização militar"><Input id="om" value={om} onChange={(event) => setOm(event.target.value)} /></Field>
                <Field id="guest-notes" label="Observações do militar"><Textarea id="guest-notes" value={guestNotes} onChange={(event) => setGuestNotes(event.target.value)} /></Field>
              </div>
            </fieldset>
          ) : null}
          {kind === 'hospedagem' ? (
            <fieldset className="rounded-md border border-line bg-card p-3" disabled={locked}>
              <legend className="px-1 text-sm font-semibold text-navy-900">Dependentes desta estada</legend>
              <p className="mt-1 mb-3 text-sm text-muted">Idade maior que a de isenção na entrada também paga. Com a idade de isenção ou menos, é isento. Ao escolher um militar já cadastrado, os dependentes do cadastro entram aqui.</p>
              <DependentEditor rows={dependents} onChange={setDependents} disabled={locked} />
            </fieldset>
          ) : null}
          {!locked ? (
            <Button type="submit" disabled={saving} data-testid="save-reservation">{saving ? 'Salvando…' : stay ? 'Salvar alterações' : 'Registrar reserva'}</Button>
          ) : null}
        </form>
        {stay && stay.status !== 'bloqueado' && stay.status !== 'cancelada' ? (
          <section className="mt-6 rounded-lg border border-line bg-card p-3">
            <h3 className="text-base font-semibold text-navy-900">Pagamentos</h3>
            <ul className="mt-2 divide-y divide-line">
              {stay.payments.length === 0 ? <li className="py-2 text-sm text-muted">Nenhum pagamento registrado.</li> : null}
              {stay.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>{formatDate(payment.paidAt)} · {PAYMENT_LABEL[payment.method]}{payment.notes ? ` · ${payment.notes}` : ''}</span>
                  <span className="flex items-center gap-2 font-semibold">
                    {formatMoney(payment.amount)}
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ title: 'Excluir pagamento', description: 'O saldo será recalculado.', label: 'Excluir', run: async () => { if (!repository) return; await repository.deletePayment(payment.id); await reload(stay.id); setConfirm(null) } })}>Excluir</Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="pay-amount" label="Valor"><Input id="pay-amount" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Valor recebido" /></Field>
              <Field id="pay-method" label="Forma">
                <select id="pay-method" className={controlClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
                  {METHODS.map((method) => <option key={method} value={method}>{PAYMENT_LABEL[method]}</option>)}
                </select>
              </Field>
              <Field id="pay-date" label="Data"><Input id="pay-date" type="date" value={paymentDate} onChange={(event) => { if (isISODate(event.target.value)) setPaymentDate(event.target.value) }} /></Field>
              <Field id="pay-notes" label="Anotação"><Input id="pay-notes" value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /></Field>
            </div>
            <Button className="mt-3 w-full sm:w-auto" onClick={() => void addPayment()} disabled={saving}>Registrar pagamento</Button>
          </section>
        ) : null}
      </div>
      <aside className="order-1 lg:order-2 lg:sticky lg:top-4 lg:self-start">
        {kind === 'bloqueio' ? (
          <section className="rounded-lg border border-line bg-card p-4">
            <h2 className="text-base font-semibold text-navy-900">Bloqueio</h2>
            <p className="mt-2 text-sm text-muted">Manutenção não gera diária e não aceita hóspede. O período fica indisponível para reserva.</p>
          </section>
        ) : (
          <BillingCard bill={bill} />
        )}
      </aside>
      <Dialog open={finderOpen} onOpenChange={setFinderOpen}>
        <DialogContent>
          <DialogTitle>Buscar militar</DialogTitle>
          <DialogDescription>Pesquise por nome, NIP, posto ou organização.</DialogDescription>
          <Input className="mt-3" value={finderQuery} onChange={(event) => setFinderQuery(event.target.value)} placeholder="Nome, NIP ou OM" autoFocus />
          <ul className="mt-3 flex max-h-80 flex-col gap-2">
            {finderResults.length === 0 ? <li className="text-sm text-muted">Nenhum militar encontrado. Feche e preencha o titular, ou cadastre em Hóspedes.</li> : null}
            {finderResults.map((guest) => (
              <li key={guest.id}>
                <button type="button" className="min-h-12 w-full rounded-md border border-line px-3 py-2 text-left hover:bg-paper" onClick={() => void chooseGuest(guest)}>
                  <span className="block font-semibold">{guest.fullName}</span>
                  <span className="text-sm text-muted">{guest.rank} · NIP {guest.nip}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.label ?? 'Confirmar'}
        pending={saving}
        onOpenChange={(open) => { if (!open) setConfirm(null) }}
        onConfirm={() => { if (confirm) void confirm.run() }}
      />
    </div>
    </div>
  )
}
