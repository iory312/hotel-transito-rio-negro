import { CalendarRange, ClipboardList, DoorOpen, LogOut, Settings, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '@/context/session.tsx'
import { HOTEL_NAME } from '@/lib/labels.ts'
import { cn } from '@/lib/utils.ts'

const NAV = [
  { to: '/', label: 'Mapa', icon: CalendarRange, end: true },
  { to: '/hospedes', label: 'Hóspedes', icon: Users, end: false },
  { to: '/quartos', label: 'Quartos', icon: DoorOpen, end: false },
  { to: '/relatorios', label: 'Relatórios', icon: ClipboardList, end: false },
  { to: '/admin', label: 'Admin', icon: Settings, end: false },
]

function titleFor(path: string): string {
  if (path.startsWith('/reserva/nova')) return 'Nova reserva'
  if (path.startsWith('/reserva/')) return 'Reserva'
  if (path === '/hospedes/novo') return 'Novo hóspede'
  if (path.startsWith('/hospedes/')) return 'Hóspede'
  if (path.startsWith('/hospedes')) return 'Hóspedes'
  if (path.startsWith('/quartos')) return 'Quartos'
  if (path.startsWith('/relatorios')) return 'Relatórios'
  if (path.startsWith('/admin')) return 'Administração'
  return 'Mapa de reservas'
}

function navLabel(label: string): string {
  if (label === 'Admin') return 'Administração'
  return label
}

export function Shell({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession()
  const location = useLocation()
  const mode = state.status === 'ready' ? state.mode : 'remote'
  const displayName = state.status === 'ready' && state.name.trim() ? state.name.trim() : 'Recepção'

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-paper lg:flex-row">
      <aside className="no-print hidden w-56 shrink-0 flex-col bg-navy-950 text-white lg:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-[11px] font-semibold tracking-wide text-white/50 uppercase">Marinha do Brasil</p>
          <p className="mt-1 text-sm font-semibold leading-snug">{HOTEL_NAME}</p>
          <p className="mt-1 text-xs text-white/60">Recepção</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium',
                  isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {navLabel(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-xs text-white/70">
          <p className="truncate font-semibold text-white">{displayName}</p>
          <p className="truncate">{mode === 'demo' ? 'Demonstração local' : 'Banco operacional'}</p>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="no-print flex h-12 shrink-0 items-center gap-3 border-b border-line bg-card px-3 text-ink">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-muted lg:hidden">Recepção · Rio Negro</p>
            <h1 className="truncate text-sm font-semibold">{titleFor(location.pathname)}</h1>
          </div>
          <p className="hidden truncate text-xs text-muted sm:block">{mode === 'demo' ? 'Demonstração' : displayName}</p>
          <button type="button" onClick={() => void signOut()} className="inline-flex h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-navy-800" data-testid="sign-out">
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </header>
        {mode === 'demo' ? (
          <p className="no-print border-b border-line bg-gold-soft px-3 py-1.5 text-xs text-navy-950">
            Modo demonstração: os dados ficam neste navegador e não vão para o banco.
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="h-full min-h-0">{children}</div>
        </div>
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
          <ul className="grid grid-cols-5">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  data-testid={`nav-${item.label.toLocaleLowerCase('pt-BR')}`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold',
                      isActive ? 'text-navy-800' : 'text-muted',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label === 'Relatórios' ? 'Relat.' : item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
