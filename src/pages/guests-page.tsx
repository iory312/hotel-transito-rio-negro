import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state.tsx'
import { Button } from '@/components/ui/button.tsx'
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
  const searching = query.trim().length > 0

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
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink lg:hidden">Hóspedes</h2>
            <p className="text-sm text-muted">Cadastro do militar: nome, posto, NIP, OM, telefone e dependentes.</p>
          </div>
          <Button asChild data-testid="novo-hospede">
            <Link to="/hospedes/novo">
              <Plus className="h-4 w-4" />
              Novo hóspede
            </Link>
          </Button>
        </div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, NIP, posto ou OM" aria-label="Buscar hóspede" />
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {loading ? <p className="text-sm text-muted">Carregando hóspedes…</p> : null}
        {!loading && guests.length === 0 ? (
          <EmptyState
            title={searching ? 'Nenhum hóspede encontrado' : 'Nenhum hóspede ainda — cadastrar'}
            detail={
              searching
                ? 'A busca não achou nome, NIP, posto ou OM. Cadastre o militar se ele ainda não está na recepção.'
                : 'O cadastro fica aqui, separado da reserva. Depois escolha o militar ao lançar a estada.'
            }
            action={
              <Button asChild>
                <Link to="/hospedes/novo">Cadastrar hóspede</Link>
              </Button>
            }
          />
        ) : null}
        <ul className="flex flex-col gap-2">
          {guests.map((guest) => (
            <li key={guest.id}>
              <Link to={`/hospedes/${guest.id}`} className="block rounded-md border border-line bg-card px-3 py-2.5 hover:border-navy-700">
                <span className="block text-sm font-semibold text-navy-900">{guest.fullName}</span>
                <span className="mt-0.5 block text-sm text-muted">{guest.rank} · NIP {guest.nip}</span>
                <span className="block text-sm text-muted">{guest.om || 'Organização não informada'}{guest.phone ? ` · ${guest.phone}` : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
