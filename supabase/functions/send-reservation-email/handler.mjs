const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 512

export function isMailbox(value) {
  return typeof value === 'string' && value.length <= 254 &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value)
}

function line(value, maxLength, required = true) {
  if (typeof value !== 'string' || value.length > maxLength) {
    if (!required && (value === null || value === undefined)) return ''
    throw new Error('invalid_payload')
  }
  // These values are escaped before insertion in the HTML alternative.
  const clean = value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').trim()
  if (required && !clean) throw new Error('invalid_payload')
  return clean
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

export function ticketVerificationUrl(notification, siteUrl) {
  if (!UUID.test(notification.reservation_id)) throw new Error('invalid_reservation_id')
  const url = new URL('/admin/dashboard', siteUrl)
  url.searchParams.set('ticket', notification.reservation_id)
  return url.href
}

export function buildMessage(notification, siteUrl) {
  const { payload, recipient_email: recipient, id } = notification
  if (!UUID.test(id) || !isMailbox(recipient) || !payload ||
      !['approved', 'rejected', 'thank_you'].includes(payload.status) ||
      !Number.isSafeInteger(payload.amount_lkr) || payload.amount_lkr <= 0) throw new Error('invalid_payload')

  const name = line(payload.full_name, 120)
  const event = line(payload.event_name, 120)
  const reference = line(payload.reference, 100)
  const venue = line(payload.venue, 200)
  const note = line(payload.review_note, 1000, false)
  const eventDate = new Date(payload.starts_at)
  if (!payload.starts_at || Number.isNaN(eventDate.valueOf())) throw new Error('invalid_payload')
  const when = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long', timeStyle: 'short', hour12: true, timeZone: 'Asia/Colombo',
  }).format(eventDate)
  const approved = payload.status === 'approved'
  const thankYou = payload.status === 'thank_you'
  const cashPayment = payload.payment_method === 'cash'
  if (payload.payment_method !== undefined && !['cash', 'bank_transfer'].includes(payload.payment_method)) throw new Error('invalid_payload')
  const verificationUrl = approved ? ticketVerificationUrl(notification, siteUrl) : null
  const outcome = thankYou
    ? `Thank you for joining us at ${venue} tonight. Having our batch back together made Greens Heaven XXVI truly special.`
    : approved
      ? `Your ticket for ${event} is confirmed. See you at Solis!`
      : cashPayment
        ? `Your cash payment record for ${event} needs a correction. Check the organizer’s note below and contact the organizers before paying again.`
        : `We could not approve the payment receipt for ${event}. Please check the note below and upload a new receipt from your reservation page.`
  const rejectionHeading = cashPayment ? 'Your cash record needs attention.' : 'Your receipt needs attention.'
  const heading = thankYou ? 'Thank you for celebrating with us.' : approved ? 'Your evening is confirmed.' : rejectionHeading
  const rejectionSubject = cashPayment ? 'Greens Heaven: please check your cash payment' : 'Greens Heaven: please check your receipt'
  const subject = thankYou ? 'Greens Heaven: thank you for celebrating with us' : approved ? 'Greens Heaven: your ticket is confirmed' : rejectionSubject
  const body = thankYou
    ? [
        `Hi ${name},`, '', outcome, '',
        `Reservation: ${reference}`,
        `Date: ${when} (Sri Lanka time)`,
        `Venue: ${venue}`, '',
        'Batch portraits and photo booth memories will be sorted and shared with everyone soon.', '',
        `View your dashboard and event updates: ${new URL('/dashboard', siteUrl).href}`, '',
        '2023 O/L & 2026 A/L batch',
        'Greens Heaven organizing team',
      ].join('\n')
    : [
        `Hi ${name},`, '', outcome, '',
        `Reservation: ${reference}`,
        `Ticket amount: Rs. ${payload.amount_lkr.toLocaleString('en-LK')}`,
        `Date: ${when} onwards (Sri Lanka time)`,
        `Venue: ${venue}`,
        ...(note ? ['', `Organiser's note: ${note}`] : []),
        ...(approved ? ['', 'Your ticket QR is included in this email. No account is needed at the entrance; show the QR to an organizer, who will verify your current ticket status.', `Organizer verification: ${verificationUrl}`] : []),
        '', `View your dashboard: ${new URL('/dashboard', siteUrl).href}`,
        ...(approved ? ['', 'The dashboard is optional; use your account if you want to manage your reservation online.'] : ['', 'Sign in with the account you used to reserve.']),
        '', 'Greens Heaven organizing team',
      ].join('\n')

  const cardContent = thankYou
    ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;color:#a7c49a">ATTENDANCE CONFIRMED · ENTRANCE &amp; PHOTO BOOTH</p><strong style="font-size:28px;color:#e2f0da">${escapeHtml(reference)}</strong><p style="line-height:1.7;color:#c2d1ba;margin:12px 0 0">${escapeHtml(when)} · Sri Lanka<br>${escapeHtml(venue)}</p><p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#bed6ae">Photos from the photo booth will be sorted and shared with the batch shortly. Check your dashboard for gallery updates.</p>`
    : `<p style="margin:0 0 8px;font-size:12px;color:#a7c49a">YOUR RESERVATION</p><strong style="font-size:28px;color:#e2f0da">${escapeHtml(reference)}</strong><p style="line-height:1.7;color:#c2d1ba">${escapeHtml(when)} onwards · Sri Lanka<br>${escapeHtml(venue)}<br>One ticket · Rs. ${payload.amount_lkr.toLocaleString('en-LK')}</p>${approved ? '<img src="cid:ticket-qr@greensheaven" width="240" height="240" alt="Ticket verification QR code" style="display:block;box-sizing:border-box;max-width:100%;height:auto;background:white;border:12px solid white;border-radius:12px"><p style="font-size:12px;line-height:1.6;color:#b6c8ad">Keep this QR ready for the organizers. No account is needed at the entrance.</p>' : ''}`

  return {
    to: { address: recipient },
    subject,
    text: body,
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#050907;font-family:Arial,sans-serif;color:#e8eee9"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#0d1810;border:1px solid #33462e;border-radius:20px"><tr><td style="padding:32px"><p style="margin:0 0 8px;letter-spacing:3px;color:#a7c49a;font-size:12px">ISIPATHANA COLLEGE · XXVI</p><h1 style="margin:0;font-size:30px;line-height:1.1;color:#d5eec7">GREENS<br>HEAVEN</h1><h2 style="margin:32px 0 16px;font-family:Georgia,serif;font-size:30px;font-weight:normal">${escapeHtml(heading)}</h2><p style="line-height:1.7">Hi ${escapeHtml(name)},</p><p style="line-height:1.7;color:#c2d1ba">${escapeHtml(outcome)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-top:1px dashed #738a64;border-bottom:1px dashed #738a64"><tr><td style="padding:24px 0">${cardContent}</td></tr></table>${note ? `<p style="line-height:1.7;color:#c2d1ba"><strong>Organizer’s note</strong><br>${escapeHtml(note)}</p>` : ''}<p style="margin:28px 0"><a href="${escapeHtml(new URL('/dashboard', siteUrl).href)}" style="display:inline-block;padding:16px 24px;background:#bed6ae;border-radius:10px;color:#10220e;text-decoration:none;font-weight:bold">${thankYou ? 'View event dashboard' : 'View my ticket'}</a></p><p style="font-size:13px;line-height:1.6;color:#b6c8ad">${thankYou ? 'Photos and batch updates will appear on your dashboard.' : approved ? 'No sign-in is needed to enter. Your dashboard is optional if you want to manage your reservation online.' : 'Sign in with the account you used to reserve.'}<br><a href="${escapeHtml(new URL('/dashboard', siteUrl).href)}" style="color:#bed6ae;word-break:break-all">${escapeHtml(new URL('/dashboard', siteUrl).href)}</a></p><p style="font-size:12px;line-height:1.7;color:#9eaf95">2023 O/L &amp; 2026 A/L batch<br>Greens Heaven organizing team</p></td></tr></table></td></tr></table></body></html>`,
    // Helpful for tracing in provider logs; SMTP does not guarantee deduplication by Message-ID.
    messageId: `<greens-heaven-${id}@${new URL(siteUrl).hostname}>`,
    disableFileAccess: true,
    disableUrlAccess: true,
  }
}

export function smtpSettings(env) {
  const provider = env.SMTP_PROVIDER || (env.GMAIL_SMTP_USER ? 'gmail' : 'brevo')
  if (!['brevo', 'gmail'].includes(provider)) throw new Error('invalid_smtp_provider')
  const user = env.SMTP_USER || env.GMAIL_SMTP_USER
  const from = env.SMTP_FROM_EMAIL || env.GMAIL_SMTP_USER
  const password = env.SMTP_PASSWORD || env.GMAIL_SMTP_APP_PASSWORD || ''
  if (!isMailbox(from) || typeof user !== 'string' || !user || user.length > 254 || /[\r\n]/.test(user) || !password || password.length > 1000) throw new Error('invalid_smtp_configuration')
  if (provider === 'gmail' && !/^[a-zA-Z0-9]{16}$/.test(password.replaceAll(' ', ''))) throw new Error('invalid_smtp_configuration')
  return { host: provider === 'brevo' ? 'smtp-relay.brevo.com' : 'smtp.gmail.com', user, from, password: provider === 'gmail' ? password.replaceAll(' ', '') : password }
}

export function smtpFailure(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const command = typeof error?.command === 'string' ? error.command.toUpperCase() : ''
  // Only explicitly rejected or definitely pre-DATA attempts are safe to retry.
  // A dropped connection/timeout during DATA may already have delivered the email.
  if (Number.isInteger(error?.responseCode) && error.responseCode >= 400 && error.responseCode < 600) {
    return { status: 'failed', code: 'smtp_rejected' }
  }
  if (['EAUTH', 'EDNS', 'ECONNECTION', 'EENVELOPE'].includes(code) ||
      (['ETIMEDOUT', 'ESOCKET'].includes(code) && ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH'].includes(command))) {
    return { status: 'failed', code: code === 'EAUTH' ? 'smtp_auth_failed' : 'smtp_connection_failed' }
  }
  return { status: 'unknown', code: 'smtp_delivery_unconfirmed' }
}

function allowedOrigin(value) {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.origin !== value || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('invalid_configuration')
  }
  return url.origin
}

function readSettings(env) {
  const origins = new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean).map(allowedOrigin))
  if (!origins.size || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('invalid_configuration')
  }
  const site = allowedOrigin(env.SITE_URL)
  if (!origins.has(site)) throw new Error('invalid_configuration')
  return { origins, site }
}

async function requestAction(req) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('invalid_request')
  const reader = req.body?.getReader()
  if (!reader) throw new Error('invalid_request')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new Error('invalid_request')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const body = JSON.parse(new TextDecoder().decode(bytes))
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new Error('invalid_request')
  }
  const keys = Object.keys(body).sort()
  if (keys.length === 1 && keys[0] === 'notification_id' && UUID.test(body.notification_id || '')) {
    return { type: 'notification', id: body.notification_id }
  }
  if (keys.length === 2 && keys[0] === 'resend' && keys[1] === 'reservation_id'
    && body.resend === true && UUID.test(body.reservation_id || '')) {
    return { type: 'ticket_resend', reservationId: body.reservation_id }
  }
  throw new Error('invalid_request')
}

export function createEmailHandler({ env, createClient, createTransport, generateQr }) {
  return async function handle(req) {
    let settings
    try { settings = readSettings(env) } catch {
      return Response.json({ error: 'Email delivery is not configured.' }, { status: 503 })
    }
    const origin = req.headers.get('origin')
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' }
    if (origin && !settings.origins.has(origin)) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (origin) headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type'
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    const respond = (body, status = 200) => Response.json(body, { status, headers })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return respond({ error: 'Use POST.' }, 405)
    const authorization = req.headers.get('authorization') || ''
    const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
    if (!token) return respond({ error: 'Sign in to continue.' }, 401)

    try {
      const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: auth, error: authError } = await userClient.auth.getUser(token)
      if (authError || !auth?.user || auth.user.is_anonymous) return respond({ error: 'Sign in to continue.' }, 401)
      const { data: isAdmin, error: roleError } = await userClient.rpc('is_admin')
      if (roleError) return respond({ error: 'Could not verify administrator access.' }, 503)
      if (isAdmin !== true) return respond({ error: 'Administrator access is required.' }, 403)
    } catch {
      return respond({ error: 'Could not verify administrator access.' }, 503)
    }

    let action
    try { action = await requestAction(req) } catch {
      return respond({ error: 'Supply a valid notification_id or approved reservation_id resend request.' }, 400)
    }
    let smtp
    try { smtp = smtpSettings(env) } catch {
      return respond({ error: 'Email delivery is not configured.' }, 503)
    }

    const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    let id = action.id
    if (action.type === 'ticket_resend') {
      try {
        const { data, error } = await service.rpc('queue_ticket_resend', {
          p_reservation_id: action.reservationId,
        })
        if (error) {
          if (error.code === '22023') return respond({ error: 'Only an approved ticket can be resent.' }, 409)
          if (error.code === '55000') return respond({ error: 'A ticket email is pending or its delivery needs checking. Refresh delivery updates before resending.' }, 409)
          return respond({ error: 'Could not prepare the ticket email.' }, 503)
        }
        id = data?.[0]?.notification_id
        if (!UUID.test(id || '')) return respond({ error: 'Could not prepare the ticket email.' }, 503)
      } catch {
        return respond({ error: 'Could not prepare the ticket email.' }, 503)
      }
    }
    let notification
    try {
      const { data, error } = await service.rpc('claim_notification', { p_notification_id: id })
      if (error) return respond({ error: 'Could not claim this notification.' }, 503)
      notification = data?.[0]
    } catch {
      return respond({ error: 'Could not claim this notification.' }, 503)
    }
    if (!notification) return respond({ notification_id: id, status: 'not_pending' })

    const finish = async (status, error = null) => {
      try {
        const result = await service.rpc('finish_notification', {
          p_notification_id: id, p_claim_token: notification.claim_token,
          p_status: status, p_error: error,
        })
        return !result.error && result.data === true
      } catch { return false }
    }
    let message
    try {
      message = buildMessage(notification, settings.site)
      if (notification.payload.status === 'approved') {
        const qr = await generateQr(ticketVerificationUrl(notification, settings.site))
        if (!(qr instanceof Uint8Array) || qr.length === 0 || qr.length > 100000) throw new Error('invalid_qr')
        message.attachments = [{ filename: 'Greens-Heaven-ticket-QR.png', content: qr, contentType: 'image/png', cid: 'ticket-qr@greensheaven', contentDisposition: 'inline' }]
      }
    } catch {
      await finish('failed', 'invalid_stored_payload')
      return respond({ notification_id: id, status: 'failed', error: 'The saved notification is invalid. Contact the site administrator.' }, 502)
    }

    let transport
    try {
      transport = createTransport({
        host: smtp.host, port: 465, secure: true,
        auth: { user: smtp.user, pass: smtp.password },
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
        disableFileAccess: true, disableUrlAccess: true,
        logger: false, debug: false,
      })
      const result = await transport.sendMail({
        ...message,
        from: { name: 'Greens Heaven XXVI', address: smtp.from },
        envelope: { from: smtp.from, to: [notification.recipient_email] },
      })
      if (!Array.isArray(result.accepted) || result.accepted.length !== 1) {
        await finish('unknown', 'smtp_delivery_unconfirmed')
        return respond({ notification_id: id, status: 'unknown', error: 'Delivery is unconfirmed. Check your email provider’s logs before retrying.' }, 502)
      }
    } catch (error) {
      const outcome = smtpFailure(error)
      await finish(outcome.status, outcome.code)
      return respond({ notification_id: id, status: outcome.status,
        error: outcome.status === 'failed' ? 'Email was not sent. Check the email setup and retry.' : 'Delivery is unconfirmed. Check your email provider’s logs before retrying.',
      }, 502)
    } finally { transport?.close() }

    if (!await finish('sent')) {
      // The SMTP provider may have accepted it. Leave the claim blocked instead of sending again.
      return respond({ notification_id: id, status: 'unknown', error: 'The provider accepted the email, but its status could not be saved. Check provider logs before retrying.' }, 502)
    }
    return respond({ notification_id: id, status: 'sent' })
  }
}
