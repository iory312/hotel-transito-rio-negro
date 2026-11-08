export type EnvConfig =
  | { mode: 'demo'; reason: 'missing' }
  | { mode: 'remote'; url: string; anonKey: string }
  | { mode: 'invalid'; message: string }

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

function jwtRole(key: string): string | null {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
    const payload = JSON.parse(json) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function resolveEnv(input: { url?: string; key?: string }): EnvConfig {
  const url = clean(input.url)
  const key = clean(input.key)
  if (!url && !key) return { mode: 'demo', reason: 'missing' }
  if (!url || !key) {
    return {
      mode: 'invalid',
      message:
        'Informe a URL e a chave anon juntas, ou deixe as duas vazias para usar o modo demonstração.',
    }
  }
  if (/your-project|YOUR_|example\.supabase|changeme|<.*>/i.test(`${url} ${key}`)) {
    return {
      mode: 'invalid',
      message: 'Substitua os valores de exemplo do .env pela URL e pela chave anon do projeto.',
    }
  }
  if (key.startsWith('sb_secret_') || key.startsWith('sb_secret')) {
    return {
      mode: 'invalid',
      message: 'A chave informada é secreta. No navegador use apenas a chave anon ou publishable.',
    }
  }
  const role = jwtRole(key)
  if (role === 'service_role') {
    return {
      mode: 'invalid',
      message: 'A chave informada é service_role. Ela não pode ir para o navegador. Use a chave anon.',
    }
  }
  const publishable = key.startsWith('sb_publishable_') && key.length >= 20
  const anonJwt = role === 'anon'
  if (!publishable && !anonJwt) {
    return { mode: 'invalid', message: 'A chave não é uma chave anon nem publishable.' }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { mode: 'invalid', message: 'A URL do Supabase é inválida.' }
  }
  const localHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
  if (parsed.protocol !== 'https:' && !localHttp) {
    return { mode: 'invalid', message: 'A URL do Supabase precisa usar HTTPS.' }
  }
  return { mode: 'remote', url: url.replace(/\/$/, ''), anonKey: key }
}
