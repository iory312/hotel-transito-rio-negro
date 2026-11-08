import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input.tsx'
import { useSession } from '@/context/session.tsx'
import { toUserMessage } from '@/lib/errors.ts'
import type { Guest } from '@/lib/types.ts'

export function GuestsPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [query, setQuery] = useState('')
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repository) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      void repository
        .listGuests(query)
        .then((rows) => {
          setGuests(rows)
          setError(null)
        })
        .catch((err: unknown) => setError(toUserMessage(err, 'Não foi possível carregar os hóspedes.')))
        .finally(() => setLoading(false))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [repository, query])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:p-4">
      <div>
        <h2 className="font-display text-4xl text-navy-900 lg:hidden">Hóspedes</h2>
        <p className="text-sm text-muted">Militares já hospedados. Abra o nome para ver o histórico e corrigir o cadastro.</p>
      </div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, NIP, posto ou OM" aria-label="Buscar hóspede" />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Carregando hóspedes…</p> : null}
      {!loading && guests.length === 0 ? <p className="rounded-md border border-dashed border-line bg-card p-4 text-sm">Nenhum hóspede encontrado.</p> : null}
      <ul className="flex flex-col gap-2">
        {guests.map((guest) => (
          <li key={guest.id}>
            <Link to={`/hospedes/${guest.id}`} className="block rounded-lg border border-line bg-card p-3 hover:border-navy-700">
              <span className="block font-semibold text-navy-900">{guest.fullName}</span>
              <span className="mt-1 block text-sm text-muted">{guest.rank} · NIP {guest.nip}</span>
              <span className="block text-sm text-muted">{guest.om || 'Organização não informada'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
