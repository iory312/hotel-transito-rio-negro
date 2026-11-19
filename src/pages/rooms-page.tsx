import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state.tsx'
import { Field } from '@/components/field.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input, controlClass } from '@/components/ui/input.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { useSession } from '@/context/session.tsx'
import { toUserMessage } from '@/lib/errors.ts'
import type { HousekeepingStatus, Room, RoomCategory } from '@/lib/types.ts'

export function RoomsPage() {
  const { state } = useSession()
  const repository = state.status === 'ready' ? state.repository : null
  const [rooms, setRooms] = useState<Room[]>([])
  const [categories, setCategories] = useState<RoomCategory[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftCapacity, setDraftCapacity] = useState('2')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const activeCount = rooms.filter((room) => room.active).length

  async function reload() {
    if (!repository) return
    const [nextRooms, nextCategories] = await Promise.all([
      repository.listRooms({ includeInactive: true }),
      repository.listCategories(),
    ])
    setRooms(nextRooms)
    setCategories(nextCategories)
  }

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    void Promise.all([repository.listRooms({ includeInactive: true }), repository.listCategories()])
      .then(([nextRooms, nextCategories]) => {
        if (cancelled) return
        setRooms(nextRooms)
        setCategories(nextCategories)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toUserMessage(err, 'Não foi possível carregar os quartos.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository])

  async function saveRoom(room: Room) {
    if (!repository) return
    setError(null)
    setNotice(null)
    try {
      await repository.updateRoom(room.id, {
        number: room.number,
        name: room.name,
        notes: room.notes,
        housekeeping: room.housekeeping,
        active: room.active,
        categoryId: room.categoryId,
      })
      setNotice(`UH ${room.number} atualizada.`)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar o quarto.'))
    }
  }

  async function saveCategory(category: RoomCategory) {
    if (!repository) return
    setError(null)
    setNotice(null)
    try {
      await repository.saveCategory({ id: category.id, name: category.name, capacity: category.capacity })
      await reload()
      setNotice(`Categoria ${category.name} atualizada.`)
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível salvar a categoria.'))
    }
  }

  async function createCategory() {
    if (!repository) return
    setError(null)
    setNotice(null)
    const capacity = Number(draftCapacity)
    try {
      await repository.saveCategory({ name: draftName, capacity })
      setDraftName('')
      setDraftCapacity('2')
      await reload()
      setNotice('Categoria criada.')
    } catch (err) {
      setError(toUserMessage(err, 'Não foi possível criar a categoria.'))
    }
  }

  return (
    <div className="h-full overflow-auto" data-testid="rooms-page">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 sm:p-4">
        <div>
          <h2 className="text-base font-semibold text-ink lg:hidden">Quartos</h2>
          <p className="text-sm text-muted">
            {loading ? 'Carregando as UHs…' : `${rooms.length} UHs no cadastro · ${activeCount} ativas no mapa.`} A categoria define a capacidade máxima. UH inativa sai do mapa e não aceita reserva.
          </p>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {notice ? <p className="rounded-md bg-gold-soft px-3 py-2 text-sm">{notice}</p> : null}
        <section className="rounded-md border border-line bg-card p-3" data-testid="room-categories">
          <h3 className="text-base font-semibold text-navy-900">Categorias</h3>
          <p className="mt-1 text-sm text-muted">Exemplo: apartamento oficial, apartamento praça, suíte. A capacidade é o número de pessoas na UH, titular incluso.</p>
          <div className="mt-3 flex flex-col gap-3">
            {categories.map((category) => (
              <form
                key={category.id}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault()
                  void saveCategory(category)
                }}
              >
                <Field id={`cat-name-${category.id}`} label="Nome">
                  <Input
                    id={`cat-name-${category.id}`}
                    value={category.name}
                    onChange={(event) =>
                      setCategories((rows) => rows.map((item) => (item.id === category.id ? { ...item, name: event.target.value } : item)))
                    }
                  />
                </Field>
                <Field id={`cat-cap-${category.id}`} label="Capacidade">
                  <Input
                    id={`cat-cap-${category.id}`}
                    inputMode="numeric"
                    value={String(category.capacity)}
                    onChange={(event) =>
                      setCategories((rows) =>
                        rows.map((item) =>
                          item.id === category.id ? { ...item, capacity: Number(event.target.value) } : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Button type="submit" size="sm">Salvar categoria</Button>
              </form>
            ))}
          </div>
          <form
            className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              void createCategory()
            }}
          >
            <Field id="new-category" label="Nova categoria">
              <Input id="new-category" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Ex.: Apartamento suboficial" />
            </Field>
            <Field id="new-capacity" label="Capacidade">
              <Input id="new-capacity" inputMode="numeric" value={draftCapacity} onChange={(event) => setDraftCapacity(event.target.value)} />
            </Field>
            <Button type="submit" size="sm" variant="outline">Adicionar</Button>
          </form>
        </section>
        {!loading && rooms.length === 0 ? (
          <EmptyState
            title="Nenhuma UH cadastrada"
            detail="O hotel deveria ter 14 quartos. Se a lista veio vazia depois do login, confira se a conta está na equipe. Sem UH, o mapa não tem onde lançar reserva."
            action={
              <Button asChild variant="outline">
                <Link to="/mapa">Voltar ao mapa</Link>
              </Button>
            }
          />
        ) : null}
        <div className="flex flex-col gap-3" data-testid="room-list">
          {rooms.map((room) => (
            <form
              key={room.id}
              data-testid={`uh-${room.number}`}
              className={`grid gap-3 rounded-md border border-line bg-card p-3 ${room.active ? '' : 'opacity-70'}`}
              onSubmit={(event) => {
                event.preventDefault()
                void saveRoom(room)
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_11rem_auto] lg:items-end">
                <Field id={`number-${room.id}`} label="Número">
                  <Input
                    id={`number-${room.id}`}
                    value={room.number}
                    onChange={(event) => setRooms((rows) => rows.map((item) => (item.id === room.id ? { ...item, number: event.target.value } : item)))}
                  />
                </Field>
                <Field id={`name-${room.id}`} label="Nome">
                  <Input
                    id={`name-${room.id}`}
                    value={room.name}
                    onChange={(event) => setRooms((rows) => rows.map((item) => (item.id === room.id ? { ...item, name: event.target.value } : item)))}
                  />
                </Field>
                <Field id={`category-${room.id}`} label="Categoria">
                  <select
                    id={`category-${room.id}`}
                    className={controlClass}
                    value={room.categoryId ?? ''}
                    onChange={(event) =>
                      setRooms((rows) => rows.map((item) => (item.id === room.id ? { ...item, categoryId: event.target.value || null } : item)))
                    }
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} · até {category.capacity}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`clean-${room.id}`} label="Limpeza">
                  <select
                    id={`clean-${room.id}`}
                    className={controlClass}
                    value={room.housekeeping}
                    onChange={(event) =>
                      setRooms((rows) =>
                        rows.map((item) =>
                          item.id === room.id ? { ...item, housekeeping: event.target.value as HousekeepingStatus } : item,
                        ),
                      )
                    }
                  >
                    <option value="limpa">Limpa</option>
                    <option value="limpeza">Em limpeza</option>
                  </select>
                </Field>
                <label className="flex h-10 items-center gap-2 text-sm font-semibold text-navy-900">
                  <input
                    type="checkbox"
                    checked={room.active}
                    onChange={(event) => setRooms((rows) => rows.map((item) => (item.id === room.id ? { ...item, active: event.target.checked } : item)))}
                  />
                  Ativa
                </label>
              </div>
              <Field id={`notes-${room.id}`} label="Notas">
                <Textarea
                  id={`notes-${room.id}`}
                  value={room.notes}
                  onChange={(event) => setRooms((rows) => rows.map((item) => (item.id === room.id ? { ...item, notes: event.target.value } : item)))}
                />
              </Field>
              <div>
                <Button type="submit" size="sm">Salvar UH</Button>
              </div>
            </form>
          ))}
        </div>
      </div>
    </div>
  )
}
