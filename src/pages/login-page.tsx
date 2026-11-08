import { useState, type FormEvent } from 'react'
import { Mark } from '@/components/mark.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { useSession } from '@/context/session.tsx'
import { toUserMessage } from '@/lib/errors.ts'
import { DEMO_EMAIL, DEMO_PASSWORD, HOTEL_NAME, HOTEL_SUBTITLE } from '@/lib/labels.ts'

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
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <section className="login-bg flex flex-col justify-end px-5 py-8 text-white lg:flex-1 lg:justify-center lg:px-16 lg:py-12">
        <Mark className="h-12 w-12" />
        <p className="mt-5 text-xs font-semibold tracking-[0.18em] text-gold uppercase">Marinha do Brasil</p>
        <h1 className="mt-2 max-w-xl font-display text-[2.7rem] leading-[0.92] lg:text-7xl">{HOTEL_NAME}</h1>
        <div className="mt-4 h-px w-24 bg-gold" />
        <p className="mt-4 max-w-md text-base text-white/80">{HOTEL_SUBTITLE}</p>
        <p className="mt-2 text-sm text-white/60">Uso interno da recepção. Sem reserva pública.</p>
      </section>
      <section className="flex flex-1 items-center bg-paper px-4 py-6 lg:px-12">
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-md rounded-lg border border-line bg-card p-5">
          <h2 className="font-display text-3xl text-navy-900">Acesso da recepção</h2>
          <p className="mt-1 text-sm text-muted">Entre com o e-mail e a senha fornecidos pela administração.</p>
          {demo ? (
            <div className="mt-4 rounded-md border border-gold bg-gold-soft p-3 text-sm text-navy-950">
              <p className="font-semibold">Modo demonstração</p>
              <p className="mt-1">Nenhum dado sai deste navegador. Para revisar as telas, use {DEMO_EMAIL} e a senha {DEMO_PASSWORD}.</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">Conexão com o banco protegida por sessão. Visitante sem login não vê hóspedes nem NIPs.</p>
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
          <Button type="submit" className="mt-5 w-full" disabled={pending} data-testid="login-submit">
            {pending ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </section>
    </div>
  )
}

export function GateScreen({ title, message, action }: { title: string; message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="login-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg bg-card p-5 text-ink">
        <Mark />
        <h1 className="mt-4 font-display text-4xl text-navy-900">{title}</h1>
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
