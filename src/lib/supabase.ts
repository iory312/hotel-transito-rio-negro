import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EnvConfig } from '@/lib/env.ts'

let client: SupabaseClient | null = null

export function getSupabase(env: Extract<EnvConfig, { mode: 'remote' }>): SupabaseClient {
  if (!client) {
    client = createClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}
