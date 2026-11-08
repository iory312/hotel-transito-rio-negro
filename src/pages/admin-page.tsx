import { useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog.tsx'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useSession } from '@/context/session.tsx'
import { toUserMessage } from '@/lib/errors.ts'
import type { Room } from '@/lib/types.ts'

export function AdminPage() {
  const { state, updateName } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [rooms, setRooms] = useState<Room[]>([])
  const [age, setAge] = useState('6')
  const [name, setName] = useState(state.status === 'ready' ? state.name : '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    void Promise.all([repository.listRooms(), repository.getSettings()])
      .then(([nextRooms, settings]) => {
        if (cancelled) return
        setRooms(nextRooms)
        setAge(String(settings.exemptionAge))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível carregar a administração.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository])

  async function saveAge() {
    if (!repository) return
    const value = Number(age)
    setError(null)
    setNotice(null)
    try {
      await repository.updateSettings(value)
      setNotice('Idade de isenção atualizada. O cálculo de todas as contas passa a usar este limite.')
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar a idade de isenção.'))
    }
  }

  async function saveRoom(room: Room) {
    if (!repository) return
    setError(null)
    setNotice(null)
    try {
      await repository.updateRoom(room.id, { number: room.number, name: room.name, notes: room.notes })
      setNotice(`Quarto ${room.number} atualizado.`)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar o quarto.'))
    }
  }

  async function saveName() {
    setError(null)
    setNotice(null)
    try {
      await updateName(name)
      setNotice('Nome da recepção atualizado.')
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar o nome.'))
    }
  }

  if (!repository || state.status !== 'ready') return null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-4">
      <div>
        <h2 className="font-display text-4xl text-navy-900 lg:hidden">Administração</h2>
        <p className="text-sm text-muted">
          {repository.mode === 'demo'
            ? 'Demonstração local, sem banco. Os 14 quartos e as estadas de exemplo podem ser restaurados.'
            : `Banco operacional${repository.host ? ` em ${repository.host}` : ''}. RLS ativo: só a equipe autorizada lê estes dados.`}
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
      {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
      <section className="rounded-lg border border-line bg-card p-3">
        <h3 className="font-display text-2xl text-navy-900">Idade de isenção</h3>
        <p className="mt-1 text-sm text-muted">O titular sempre paga. Dependente com idade igual ou menor que este número, contada na entrada, não paga. O padrão é 6.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input inputMode="numeric" aria-label="Idade de isenção" value={age} onChange={(event) => setAge(event.target.value)} className="sm:max-w-32" />
          <Button onClick={() => void saveAge()}>Salvar idade</Button>
        </div>
      </section>
      <section className="rounded-lg border border-line bg-card p-3">
        <h3 className="font-display text-2xl text-navy-900">Seu nome na recepção</h3>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Nome na recepção" value={name} onChange={(event) => setName(event.target.value)} />
          <Button variant="outline" onClick={() => void saveName()}>Salvar nome</Button>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-2xl text-navy-900">Quartos</h3>
        {rooms.map((room) => (
          <form
            key={room.id}
            className="grid gap-3 rounded-lg border border-line bg-card p-3 sm:grid-cols-[6rem_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              void saveRoom(room)
            }}
          >
            <Field id={`number-${room.id}`} label="Número">
              <Input id={`number-${room.id}`} value={room.number} onChange={(event) => setRooms((rows) => rows.map((item) => item.id === room.id ? { ...item, number: event.target.value } : item))} />
            </Field>
            <Field id={`name-${room.id}`} label="Nome">
              <Input id={`name-${room.id}`} value={room.name} onChange={(event) => setRooms((rows) => rows.map((item) => item.id === room.id ? { ...item, name: event.target.value } : item))} />
            </Field>
            <Button type="submit" className="sm:self-end">Salvar</Button>
          </form>
        ))}
      </section>
      {repository.resetDemo ? (
        <Button variant="outline" onClick={() => setResetOpen(true)}>Restaurar dados de demonstração</Button>
      ) : null}
      <ConfirmDialog
        open={resetOpen}
        title="Restaurar demonstração"
        description="As estadas criadas neste navegador serão substituídas pelos exemplos iniciais."
        confirmLabel="Restaurar"
        onOpenChange={setResetOpen}
        onConfirm={() => {
          void repository.resetDemo?.().then(() => {
            setResetOpen(false)
            window.location.reload()
          })
        }}
      />
    </div>
  )
}
