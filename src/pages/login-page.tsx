import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { useSession } from '@/context/session.tsx'
import { toUserMessage } from '@/lib/errors.ts'
import { DEMO_EMAIL, DEMO_PASSWORD, HOTEL_NAME } from '@/lib/labels.ts'

export function LoginPage() {
  const { state, signIn } = useSession()
  const demo = state.status === 'signed_out' && state.mode === 'demo'
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(toUserMessage(err, 'E-mail ou senha incorretos.'))
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Marinha do Brasil · Recepção</p>
        <h1 className="mt-1 text-lg font-semibold text-navy-900">{HOTEL_NAME}</h1>
        <p className="mt-1 text-sm text-muted">Sistema interno da recepção. Sem reserva pública.</p>
        <form onSubmit={onSubmit} className="mt-4 rounded-md border border-line bg-card p-4">
          <h2 className="text-base font-semibold text-ink">Entrar</h2>
          <p className="mt-1 text-sm text-muted">Use o e-mail e a senha da equipe.</p>
          {demo ? (
            <div className="mt-3 rounded-md border border-line bg-paper p-3 text-sm text-ink">
              <p className="font-semibold">Modo demonstração</p>
              <p className="mt-1">Nenhum dado sai deste navegador. Para revisar as telas, use {DEMO_EMAIL} e a senha {DEMO_PASSWORD}.</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">A sessão é da equipe. Sem login, o mapa, os hóspedes e os NIPs não aparecem.</p>
          )}
          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} data-testid="login-email" />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} data-testid="login-password" />
          </div>
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="mt-4 w-full" disabled={pending} data-testid="login-submit">
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}

export function GateScreen({ title, message, action }: { title: string; message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md rounded-md border border-line bg-card p-5 text-ink">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Recepção</p>
        <h1 className="mt-1 text-lg font-semibold text-navy-900">{title}</h1>
        <p className="mt-2 text-sm leading-6">{message}</p>
        {action ? (
          <Button className="mt-5 w-full" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
