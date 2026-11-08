import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DependentEditor, type DependentRow } from '@/components/dependent-editor.tsx'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useSession } from '@/context/session.tsx'
import { formatDate } from '@/lib/dates.ts'
import { buildBill } from '@/lib/domain.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { RANKS, STATUS_LABEL } from '@/lib/labels.ts'
import { formatMoney } from '@/lib/money.ts'
import type { GuestDraft, Stay } from '@/lib/types.ts'

const EMPTY_GUEST: GuestDraft = { fullName: '', rank: '', nip: '', om: '', phone: '', notes: '' }

export function GuestPage() {
  const { id } = useParams()
  const creating = !id
  const navigate = useNavigate()
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [guest, setGuest] = useState<GuestDraft>(EMPTY_GUEST)
  const [dependents, setDependents] = useState<DependentRow[]>([])
  const [stays, setStays] = useState<Stay[]>([])
  const [exemptionAge, setExemptionAge] = useState(6)
  const [loading, setLoading] = useState(!creating)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!repository || creating || !id) return
    let cancelled = false
    void Promise.all([repository.getGuest(id), repository.getSettings()])
      .then(([profile, settings]) => {
        if (cancelled) return
        setExemptionAge(settings.exemptionAge)
        if (!profile) {
          setError('Hóspede não encontrado.')
          return
        }
        setGuest(profile.guest)
        setDependents(profile.dependents.map((dependent) => ({ key: dependent.id, fullName: dependent.fullName, birthDate: dependent.birthDate })))
        setStays(profile.stays)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível carregar o hóspede.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository, id, creating])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!repository) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const savedId = await repository.saveGuest({
        id: creating ? undefined : id,
        ...guest,
        dependents: dependents.map(({ fullName, birthDate }) => ({ fullName, birthDate })),
      })
      setNotice(creating ? 'Hóspede cadastrado.' : 'Cadastro atualizado.')
      if (creating) navigate(`/hospedes/${savedId}`, { replace: true })
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar o hóspede.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted">Carregando o hóspede…</p>
  if (!creating && error && guest.fullName === '') {
    return (
      <div className="p-4" role="alert">
        <p>{error}</p>
        <Link to="/hospedes" className="mt-3 inline-block text-sm font-semibold text-navy-800">Voltar aos hóspedes</Link>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
        <Link to="/hospedes" className="text-sm font-semibold text-navy-800">Voltar aos hóspedes</Link>
        <div>
          <h2 className="text-lg font-semibold text-navy-900">{creating ? 'Novo hóspede' : guest.fullName || 'Hóspede'}</h2>
          <p className="text-sm text-muted">Nome, posto ou graduação, NIP, organização, telefone e dependentes.</p>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
        <form onSubmit={onSubmit} className="grid gap-3 rounded-md border border-line bg-card p-3">
          <Field id="g-name" label="Nome">
            <Input id="g-name" required minLength={3} value={guest.fullName} onChange={(event) => setGuest({ ...guest, fullName: event.target.value })} />
          </Field>
          <Field id="g-rank" label="Posto ou graduação">
            <Input id="g-rank" required minLength={2} list="postos" value={guest.rank} onChange={(event) => setGuest({ ...guest, rank: event.target.value })} />
            <datalist id="postos">{RANKS.map((item) => <option key={item} value={item} />)}</datalist>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="g-nip" label="NIP">
              <Input id="g-nip" required minLength={4} value={guest.nip} autoComplete="off" onChange={(event) => setGuest({ ...guest, nip: event.target.value })} />
            </Field>
            <Field id="g-phone" label="Telefone">
              <Input id="g-phone" value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: event.target.value })} />
            </Field>
          </div>
          <Field id="g-om" label="Organização militar">
            <Input id="g-om" value={guest.om} onChange={(event) => setGuest({ ...guest, om: event.target.value })} />
          </Field>
          <Field id="g-notes" label="Observações">
            <Textarea id="g-notes" value={guest.notes} onChange={(event) => setGuest({ ...guest, notes: event.target.value })} />
          </Field>
          <fieldset className="rounded-md border border-line p-3">
            <legend className="px-1 text-sm font-semibold text-navy-900">Dependentes</legend>
            <p className="mb-3 text-sm text-muted">Ficam no cadastro do militar. Na reserva, a idade na entrada define quem paga.</p>
            <DependentEditor rows={dependents} onChange={setDependents} />
          </fieldset>
          <Button type="submit" disabled={saving} data-testid="save-guest">{saving ? 'Salvando…' : creating ? 'Cadastrar hóspede' : 'Salvar cadastro'}</Button>
        </form>
        {creating ? null : (
          <section>
            <h3 className="text-base font-semibold text-navy-900">Histórico de estadas</h3>
            {stays.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma estada registrada. Lance a primeira pelo mapa.</p> : null}
            <ul className="mt-2 flex flex-col gap-2">
              {stays.map((stay) => {
                const bill = buildBill({
                  checkIn: stay.checkIn,
                  checkOut: stay.checkOut,
                  dailyRate: stay.dailyRate,
                  exemptionAge,
                  titularName: guest.fullName,
                  dependents: stay.dependents,
                  payments: stay.payments,
                })
                return (
                  <li key={stay.id}>
                    <Link to={`/reserva/${stay.id}`} className="block rounded-md border border-line bg-card p-3">
                      <span className="text-sm font-semibold">{stay.roomName} · {STATUS_LABEL[stay.status]}</span>
                      <span className="mt-1 block text-sm text-muted">{formatDate(stay.checkIn)} a {formatDate(stay.checkOut)} · {formatMoney(bill.total)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
