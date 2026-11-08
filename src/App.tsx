import { Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/shell.tsx'
import { useSession } from '@/context/session.tsx'
import { HOTEL_NAME } from '@/lib/labels.ts'
import { AdminPage } from '@/pages/admin-page.tsx'
import { GuestPage } from '@/pages/guest-page.tsx'
import { GuestsPage } from '@/pages/guests-page.tsx'
import { GateScreen, LoginPage } from '@/pages/login-page.tsx'
import { MapPage } from '@/pages/map-page.tsx'
import { ReportsPage } from '@/pages/reports-page.tsx'
import { ReservationPage } from '@/pages/reservation-page.tsx'
import { RoomsPage } from '@/pages/rooms-page.tsx'

export default function App() {
  const { state, signOut } = useSession()

  if (state.status === 'loading') {
    return <GateScreen title={HOTEL_NAME} message="Verificando sessão…" />
  }
  if (state.status === 'config_error') {
    return <GateScreen title="Configuração incompleta" message={state.message} action={{ label: 'Recarregar', onClick: () => window.location.reload() }} />
  }
  if (state.status === 'signed_out') return <LoginPage />
  if (state.status === 'unauthorised') {
    return (
      <GateScreen
        title="Conta sem autorização"
        message={`${state.email} autenticou, mas não está na equipe do hotel. A inclusão é feita na tabela staff, não pelo próprio usuário.`}
        action={{ label: 'Sair', onClick: () => void signOut() }}
      />
    )
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/reserva/nova" element={<ReservationPage />} />
        <Route path="/reserva/:id" element={<ReservationPage />} />
        <Route path="/hospedes" element={<GuestsPage />} />
        <Route path="/hospedes/novo" element={<GuestPage />} />
        <Route path="/hospedes/:id" element={<GuestPage />} />
        <Route path="/quartos" element={<RoomsPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
