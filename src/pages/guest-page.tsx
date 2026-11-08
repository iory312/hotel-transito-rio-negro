import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useSession } from '@/context/session.tsx'
import { formatDate } from '@/lib/dates.ts'
import { buildBill } from '@/lib/domain.ts'
import { toUserMessage } from '@/lib/errors.ts'
import { STATUS_LABEL } from '@/lib/labels.ts'
import { formatMoney } from '@/lib/money.ts'
import type { GuestProfile } from '@/lib/repository.ts'

export function GuestPage() {
  const { id } = useParams()
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [profile, setProfile] = useState<GuestProfile | null>(null)
  const [exemptionAge, setExemptionAge] = useState(6)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!repository || !id) return
    let cancelled = false
    void Promise.all([repository.getGuest(id), repository.getSettings()])
      .then(([guest, settings]) => {
        if (cancelled) return
        setProfile(guest)
        setExemptionAge(settings.exemptionAge)
        if (!guest) setError('Hóspede não encontrado.')
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
  }, [repository, id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!repository || !profile) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await repository.saveGuest(profile.guest)
      setNotice('Cadastro atualizado.')
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar o hóspede.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-4 text-sm text-muted">Carregando o hóspede…</p>
  if (!profile) return <p className="p-4" role="alert">{error ?? 'Hóspede não encontrado.'}</p>
  const guest = profile.guest

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
      <Link to="/hospedes" className="text-sm font-semibold text-navy-800">Voltar aos hóspedes</Link>
      <h2 className="font-display text-4xl text-navy-900">{guest.fullName}</h2>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-line bg-card p-3">
        <Field id="g-name" label="Nome"><Input id="g-name" value={guest.fullName} onChange={(event) => setProfile({ ...profile, guest: { ...guest, fullName: event.target.value } })} /></Field>
        <Field id="g-rank" label="Posto ou graduação"><Input id="g-rank" value={guest.rank} onChange={(event) => setProfile({ ...profile, guest: { ...guest, rank: event.target.value } })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="g-nip" label="NIP"><Input id="g-nip" value={guest.nip} autoComplete="off" onChange={(event) => setProfile({ ...profile, guest: { ...guest, nip: event.target.value } })} /></Field>
          <Field id="g-phone" label="Telefone"><Input id="g-phone" value={guest.phone} onChange={(event) => setProfile({ ...profile, guest: { ...guest, phone: event.target.value } })} /></Field>
        </div>
        <Field id="g-om" label="Organização militar"><Input id="g-om" value={guest.om} onChange={(event) => setProfile({ ...profile, guest: { ...guest, om: event.target.value } })} /></Field>
        <Field id="g-notes" label="Observações"><Textarea id="g-notes" value={guest.notes} onChange={(event) => setProfile({ ...profile, guest: { ...guest, notes: event.target.value } })} /></Field>
        <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar cadastro'}</Button>
      </form>
      <section>
        <h3 className="font-display text-2xl text-navy-900">Histórico de estadas</h3>
        {profile.stays.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma estada registrada.</p> : null}
        <ul className="mt-2 flex flex-col gap-2">
          {profile.stays.map((stay) => {
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
                <Link to={`/reserva/${stay.id}`} className="block rounded-lg border border-line bg-card p-3">
                  <span className="font-semibold">{stay.roomName} · {STATUS_LABEL[stay.status]}</span>
                  <span className="mt-1 block text-sm text-muted">{formatDate(stay.checkIn)} a {formatDate(stay.checkOut)} · {formatMoney(bill.total)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
