import { createClient } from 'npm:@supabase/supabase-js@2.117.3'

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function originOf(value: string) {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.origin !== value || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('invalid_origin')
  }
  return url.origin
}

function settings(env: Record<string, string>) {
  const origins = new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(originOf))
  const site = originOf(env.SITE_URL || '')
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !origins.size || !origins.has(site)) {
    throw new Error('invalid_configuration')
  }
  return { origins, site }
}

Deno.serve(async request => {
  let config
  try { config = settings(Deno.env.toObject()) } catch {
    return Response.json({ error: 'Account setup email is not configured.' }, { status: 503 })
  }
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (origin && !config.origins.has(origin)) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  const respond = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return respond({ error: 'Use POST.' }, 405)

  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') || '')?.[1]
  if (!token) return respond({ error: 'Sign in to continue.' }, 401)
  let body: unknown
  try {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('invalid_content_type')
    const raw = await request.text()
    if (raw.length > 1024) throw new Error('invalid_body')
    body = JSON.parse(raw)
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== 1 || !ID.test((body as Record<string, unknown>).reservation_id as string || '')) throw new Error('invalid_body')
  } catch {
    return respond({ error: 'Supply a valid reservation_id.' }, 400)
  }

  const env = Deno.env.toObject()
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const { data: auth, error: authError } = await userClient.auth.getUser(token)
    if (authError || !auth?.user || auth.user.is_anonymous) return respond({ error: 'Sign in to continue.' }, 401)
    const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin')
    if (roleError) return respond({ error: 'Could not verify administrator access.' }, 503)
    if (isAdmin !== true) return respond({ error: 'Administrator access is required.' }, 403)
  } catch {
    return respond({ error: 'Could not verify administrator access.' }, 503)
  }

  const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const reservationId = (body as Record<string, string>).reservation_id
  const { data: reservation, error: lookupError } = await service.from('reservations')
    .select('id,email,registration_source,user_id')
    .eq('id', reservationId)
    .maybeSingle()
  if (lookupError) return respond({ error: 'Could not load this registration.' }, 503)
  if (!reservation || reservation.registration_source !== 'in_person') return respond({ error: 'In-person registration not found.' }, 404)
  if (reservation.user_id) return respond({ status: 'already_linked' })

  const redirectTo = new URL('/reset-password?claim=1', config.site).href
  let delivery: 'invite' | 'reset' = 'invite'
  const { error: inviteError } = await service.auth.admin.inviteUserByEmail(reservation.email, { redirectTo })
  if (inviteError) {
    if (!/already registered|already exists|user.*exists/i.test(inviteError.message || '')) {
      console.error('Account invitation failed:', inviteError.message)
      return respond({ error: 'Could not send the account setup email. Try again later.' }, 502)
    }
    delivery = 'reset'
    const { error: resetError } = await service.auth.resetPasswordForEmail(reservation.email, { redirectTo })
    if (resetError) {
      console.error('Account password setup email failed:', resetError.message)
      return respond({ error: 'Could not send the account setup email. Ask the attendee to use the sign-in page.' }, 502)
    }
  }

  const { error: updateError } = await service.from('reservations')
    .update({ account_setup_sent_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('registration_source', 'in_person')
    .is('user_id', null)
  if (updateError) console.error('Could not store account setup timestamp:', updateError.message)
  return respond({ status: 'sent', delivery })
})
