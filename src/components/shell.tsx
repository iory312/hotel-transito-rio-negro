import { CalendarRange, ClipboardList, LogOut, Settings, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Mark } from '@/components/mark.tsx'
import { useSession } from '@/context/session.tsx'
import { HOTEL_NAME } from '@/lib/labels.ts'
import { cn } from '@/lib/utils.ts'

const NAV = [
  { to: '/', label: 'Mapa', icon: CalendarRange, end: true },
  { to: '/hospedes', label: 'Hóspedes', icon: Users, end: false },
  { to: '/relatorios', label: 'Relatórios', icon: ClipboardList, end: false },
  { to: '/admin', label: 'Admin', icon: Settings, end: false },
]

function titleFor(path: string): string {
  if (path.startsWith('/reserva/nova')) return 'Nova reserva'
  if (path.startsWith('/reserva/')) return 'Reserva'
  if (path.startsWith('/hospedes/')) return 'Hóspede'
  if (path.startsWith('/hospedes')) return 'Hóspedes'
  if (path.startsWith('/relatorios')) return 'Relatórios'
  if (path.startsWith('/admin')) return 'Administração'
  return 'Mapa de reservas'
}

export function Shell({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession()
  const location = useLocation()
  const mode = state.status === 'ready' ? state.mode : 'remote'
  const displayName = state.status === 'ready' && state.name.trim() ? state.name.trim() : 'Recepção'

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-paper lg:flex-row">
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-navy-900 text-white lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          <Mark />
          <div className="min-w-0">
            <p className="font-display text-xl leading-none tracking-wide">{HOTEL_NAME}</p>
            <p className="mt-1 text-xs text-gold-soft">Recepção</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-semibold',
                  isActive ? 'bg-white/10 text-gold-soft' : 'text-white/80 hover:bg-white/5',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label === 'Admin' ? 'Administração' : item.label === 'Mapa' ? 'Mapa de reservas' : item.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-4 pb-4 text-xs text-white/60">{displayName}</p>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-navy-900 px-3 text-white">
          <Mark className="h-9 w-9 lg:hidden" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl leading-none tracking-wide lg:hidden">{HOTEL_NAME}</p>
            <h1 className="hidden truncate font-display text-2xl leading-none lg:block">{titleFor(location.pathname)}</h1>
            <p className="truncate text-[11px] text-gold-soft">{mode === 'demo' ? 'Demonstração local' : 'Banco operacional'}</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-gold-soft" data-testid="sign-out">
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </header>
        {mode === 'demo' ? (
          <p className="no-print bg-gold-soft px-3 py-2 text-sm text-navy-950">
            Modo demonstração: os dados ficam neste navegador e não vão para o banco. Configure o Supabase para a operação real.
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
          <ul className="grid grid-cols-4">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  data-testid={`nav-${item.label.toLocaleLowerCase('pt-BR')}`}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                      isActive ? 'text-navy-800' : 'text-muted',
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
