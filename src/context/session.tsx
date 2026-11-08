import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createDemoRepository, demoSignIn, readDemoSession, writeDemoSession } from '@/lib/demo-repository.ts'
import { DomainError } from '@/lib/domain.ts'
import { resolveEnv } from '@/lib/env.ts'
import { DEMO_EMAIL } from '@/lib/labels.ts'
import type { HotelRepository } from '@/lib/repository.ts'
import { createRemoteRepository } from '@/lib/remote-repository.ts'
import { getSupabase } from '@/lib/supabase.ts'

export type AppSession =
  | { status: 'loading' }
  | { status: 'config_error'; message: string }
  | { status: 'signed_out'; mode: 'demo' | 'remote' }
  | { status: 'unauthorised'; email: string }
  | { status: 'ready'; mode: 'demo' | 'remote'; email: string; name: string; userId: string | null; repository: HotelRepository }

interface SessionContextValue {
  state: AppSession
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateName: (name: string) => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const env = useMemo(
    () => resolveEnv({ url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY }),
    [],
  )
  const [state, setState] = useState<AppSession>({ status: 'loading' })

  useEffect(() => {
    if (env.mode === 'invalid') {
      setState({ status: 'config_error', message: env.message })
      return
    }
    if (env.mode === 'demo') {
      const saved = readDemoSession()
      if (saved) {
        setState({
          status: 'ready',
          mode: 'demo',
          email: saved.email,
          name: saved.name,
          userId: null,
          repository: createDemoRepository(),
        })
      } else {
        setState({ status: 'signed_out', mode: 'demo' })
      }
      return
    }

    const supabase = getSupabase(env)
    const host = new URL(env.url).host
    let alive = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!alive) return
        void adopt(session)
      }, 0)
    })

    async function adopt(session: Session | null) {
      if (!session) {
        setState({ status: 'signed_out', mode: 'remote' })
        return
      }
      const email = session.user.email ?? ''
      const staff = await supabase.from('staff').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!alive) return
      if (staff.error) {
        setState({
          status: 'config_error',
          message: 'Não foi possível confirmar a equipe no banco. Confira se o SQL de migração foi aplicado.',
        })
        return
      }
      if (!staff.data) {
        setState({ status: 'unauthorised', email })
        return
      }
      const profile = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle()
      if (!alive) return
      const name = typeof profile.data?.full_name === 'string' ? profile.data.full_name : ''
      setState({
        status: 'ready',
        mode: 'remote',
        email,
        name,
        userId: session.user.id,
        repository: createRemoteRepository(supabase, host),
      })
    }

    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [env])

  async function signIn(email: string, password: string) {
    if (env.mode === 'invalid') throw new DomainError(env.message)
    if (env.mode === 'demo') {
      const session = demoSignIn(email, password)
      writeDemoSession(session)
      setState({
        status: 'ready',
        mode: 'demo',
        email: session.email,
        name: session.name,
        userId: null,
        repository: createDemoRepository(),
      })
      return
    }
    const { error } = await getSupabase(env).auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new DomainError('E-mail ou senha incorretos.')
  }

  async function signOut() {
    if (env.mode === 'remote') await getSupabase(env).auth.signOut()
    writeDemoSession(null)
    if (env.mode !== 'invalid') setState({ status: 'signed_out', mode: env.mode })
  }

  async function updateName(name: string) {
    const trimmed = name.trim()
    if (trimmed.length > 120) throw new DomainError('Há campos fora do formato esperado.')
    if (state.status !== 'ready') return
    if (state.mode === 'demo') {
      writeDemoSession({ email: DEMO_EMAIL, name: trimmed || state.name })
      setState({ ...state, name: trimmed })
      return
    }
    if (!state.userId || env.mode !== 'remote') return
    const { error } = await getSupabase(env).from('profiles').update({ full_name: trimmed }).eq('id', state.userId)
    if (error) throw new DomainError('Não foi possível salvar o nome.')
    setState({ ...state, name: trimmed })
  }

  return <SessionContext.Provider value={{ state, signIn, signOut, updateName }}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('Sessão indisponível')
  return value
}
