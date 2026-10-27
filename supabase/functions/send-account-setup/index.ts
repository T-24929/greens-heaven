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
    const fields = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
    const value = body as Record<string, unknown>
    const validInitial = fields.length === 1 && fields[0] === 'reservation_id' && ID.test(String(value.reservation_id || ''))
    const validRetry = fields.length === 1 && fields[0] === 'notification_id' && ID.test(String(value.notification_id || ''))
    const validResend = fields.length === 2 && fields.includes('notification_id') && fields.includes('resend') && value.resend === true && ID.test(String(value.notification_id || ''))
    if (!validInitial && !validRetry && !validResend) throw new Error('invalid_body')
  } catch {
    return respond({ error: 'Supply a valid reservation_id or notification_id.' }, 400)
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
  const value = body as Record<string, unknown>
  let notificationId = typeof value.notification_id === 'string' ? value.notification_id : ''

  if (value.resend === true) {
    const { data: previous, error: previousError } = await service.from('notification_outbox')
      .select('id,reservation_id,notification_type')
      .eq('id', notificationId)
      .maybeSingle()
    if (previousError) return respond({ error: 'Could not load this setup email.' }, 503)
    if (!previous || previous.notification_type !== 'account_setup') return respond({ error: 'Account setup notification not found.' }, 404)

    const { data: queued, error: queueError } = await service.rpc('queue_account_setup_resend', {
      p_reservation_id: previous.reservation_id,
    })
    if (queueError) {
      console.error('Could not queue a replacement setup email:', queueError.message)
      return respond({ error: 'Could not queue a new setup email.' }, 503)
    }
    const replacement = queued?.[0]
    if (!replacement) return respond({ error: 'Could not queue a new setup email.' }, 503)
    if (replacement.status === 'already_linked') return respond({ status: 'already_linked' })
    if (['sending', 'unknown'].includes(replacement.status)) return respond({ status: replacement.status, error: 'Check the latest delivery status before sending another email.' }, 409)
    if (replacement.status === 'failed' && replacement.attempts >= 5) return respond({ status: 'failed', error: 'Retry limit reached. Check the delivery logs.' }, 429)
    notificationId = replacement.notification_id
  }

  if (value.reservation_id) {
    const { data: reservation, error: lookupError } = await service.from('reservations')
      .select('id,registration_source,user_id')
      .eq('id', String(value.reservation_id))
      .maybeSingle()
    if (lookupError) return respond({ error: 'Could not load this registration.' }, 503)
    if (!reservation || reservation.registration_source !== 'in_person') return respond({ error: 'In-person registration not found.' }, 404)
    if (reservation.user_id) return respond({ status: 'already_linked' })

    const { data: queued, error: queueError } = await service.rpc('queue_account_setup_notification', {
      p_reservation_id: reservation.id,
    })
    if (queueError) {
      console.error('Could not queue account setup notification:', queueError.message)
      return respond({ error: 'Could not queue the account setup email.' }, 503)
    }
    const item = queued?.[0]
    if (!item) return respond({ error: 'Could not queue the account setup email.' }, 503)
    if (item.status === 'already_linked') return respond({ status: 'already_linked' })
    notificationId = item.notification_id
    if (!notificationId) return respond({ error: 'The setup notification is missing its ID.' }, 503)
    if (['sent', 'sending', 'unknown'].includes(item.status)) return respond({ status: item.status, already_sent: item.status === 'sent' })
    if (item.status === 'failed' && item.attempts >= 5) return respond({ status: 'failed', error: 'Retry limit reached. Check the delivery logs.' }, 429)
  } else if (value.resend !== true) {
    const { data: item, error: lookupError } = await service.from('notification_outbox')
      .select('id,notification_type,status,attempts')
      .eq('id', notificationId)
      .maybeSingle()
    if (lookupError) return respond({ error: 'Could not load this notification.' }, 503)
    if (!item || item.notification_type !== 'account_setup') return respond({ error: 'Account setup notification not found.' }, 404)
    if (['sent', 'sending', 'unknown'].includes(item.status)) return respond({ status: item.status, already_sent: item.status === 'sent' })
    if (item.status === 'failed' && item.attempts >= 5) return respond({ status: 'failed', error: 'Retry limit reached. Check the delivery logs.' }, 429)
  }

  const { data: claimed, error: claimError } = await service.rpc('claim_account_setup_notification', {
    p_notification_id: notificationId,
  })
  if (claimError) {
    console.error('Could not claim account setup notification:', claimError.message)
    return respond({ error: 'Could not start account setup delivery.' }, 503)
  }
  const notification = claimed?.[0]
  if (!notification) return respond({ status: 'not_pending' }, 409)

  const finish = async (status: 'sent' | 'failed' | 'unknown', error: string | null = null) => {
    try {
      const result = await service.rpc('finish_notification', {
        p_notification_id: notificationId,
        p_claim_token: notification.claim_token,
        p_status: status,
        p_error: error,
      })
      return !result.error && result.data === true
    } catch { return false }
  }
  const finishFailure = async (code: string) => {
    if (!await finish('failed', code)) {
      await finish('unknown', 'outbox_status_not_saved')
      return respond({ status: 'unknown', error: 'The email status could not be saved. Check delivery before retrying.' }, 503)
    }
    return respond({ status: 'failed', error: 'Could not send the account setup email. Check SMTP settings and retry.' }, 502)
  }

  const inviteRedirectTo = new URL('/auth/confirm?next=attendee', config.site).href
  const recoveryRedirectTo = new URL('/auth/confirm?next=account-setup', config.site).href
  let delivery: 'invite' | 'reset' = 'invite'
  try {
    const { error: inviteError } = await service.auth.admin.inviteUserByEmail(notification.recipient_email, { redirectTo: inviteRedirectTo })
    if (inviteError) {
      if (!/already registered|already exists|user.*exists/i.test(inviteError.message || '')) {
        console.error('Account invitation failed:', inviteError.message)
        return await finishFailure('auth_invite_failed')
      }
      delivery = 'reset'
      const { error: resetError } = await service.auth.resetPasswordForEmail(notification.recipient_email, { redirectTo: recoveryRedirectTo })
      if (resetError) {
        console.error('Account password setup email failed:', resetError.message)
        return await finishFailure('auth_reset_failed')
      }
    }
  } catch (deliveryError) {
    console.error('Account setup delivery result is uncertain:', deliveryError?.message || deliveryError)
    if (!await finish('unknown', 'auth_delivery_unconfirmed')) {
      return respond({ status: 'unknown', error: 'Delivery is unconfirmed. Check Auth logs before retrying.' }, 503)
    }
    return respond({ status: 'unknown', error: 'Delivery is unconfirmed. Check Auth logs before retrying.' }, 502)
  }

  if (!await finish('sent')) {
    await finish('unknown', 'auth_accepted_outbox_status_not_saved')
    return respond({ status: 'unknown', error: 'Auth accepted the email, but its status could not be saved. Check delivery before retrying.' }, 503)
  }

  const { error: updateError } = await service.from('reservations')
    .update({ account_setup_sent_at: new Date().toISOString() })
    .eq('id', notification.reservation_id)
    .eq('registration_source', 'in_person')
    .is('user_id', null)
  if (updateError) console.error('Could not store account setup timestamp:', updateError.message)

  return respond({ status: 'sent', delivery })
})
