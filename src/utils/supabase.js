import { createClient } from '@supabase/supabase-js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
const supabaseUrl = env.VITE_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

function isPublicKey(key) {
  if (key?.startsWith('sb_publishable_')) return true
  try {
    const payload = key.split('.')[1] || ''
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
    return JSON.parse(atob(padded)).role === 'anon'
  } catch {
    return false
  }
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl && /^https?:\/\//.test(supabaseUrl) && isPublicKey(supabaseKey),
)

// Browser code must only contain a publishable key. RLS enforces access.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
  : null
