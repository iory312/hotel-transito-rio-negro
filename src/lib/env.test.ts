import { describe, expect, it } from 'vitest'
import { resolveEnv } from '@/lib/env.ts'

const anon = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig'
const service = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'

describe('resolveEnv', () => {
  it('entra em demonstração quando as variáveis faltam', () => {
    expect(resolveEnv({ url: '  ', key: '' }).mode).toBe('demo')
  })

  it('recusa configuração pela metade', () => {
    expect(resolveEnv({ url: 'https://abc.supabase.co', key: '' }).mode).toBe('invalid')
  })

  it('recusa service_role e chave secreta', () => {
    expect(resolveEnv({ url: 'https://abc.supabase.co', key: service }).mode).toBe('invalid')
    expect(resolveEnv({ url: 'https://abc.supabase.co', key: 'sb_secret_abc' }).mode).toBe('invalid')
  })

  it('exige https fora de localhost', () => {
    expect(resolveEnv({ url: 'http://abc.supabase.co', key: anon }).mode).toBe('invalid')
    expect(resolveEnv({ url: 'http://localhost:54321', key: anon }).mode).toBe('remote')
    expect(resolveEnv({ url: 'https://abc.supabase.co/', key: anon })).toMatchObject({
      mode: 'remote',
      url: 'https://abc.supabase.co',
    })
  })

  it('aceita chave publishable', () => {
    expect(resolveEnv({ url: 'https://abc.supabase.co', key: 'sb_publishable_example_key' }).mode).toBe('remote')
  })
})
