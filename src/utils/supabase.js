import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function isPublicKey(key) {
  if (key?.startsWith('sb_publishable_')) return true
  try {
    return JSON.parse(atob(key.split('.')[1])).role === 'anon'
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
