import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMessage, createEmailHandler, isMailbox, smtpFailure, smtpSettings, ticketVerificationUrl } from './handler.mjs'
import QRCode from 'qrcode'

const ID = 'd947334a-76c0-4d1e-8d58-a063f5b99d0c'
const TOKEN = 'de1d76ac-ec12-4263-9a53-39a15ca3c399'
const env = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-test-key', SITE_URL: 'https://greens.example',
  ALLOWED_ORIGINS: 'https://greens.example,https://admin.greens.example',
  GMAIL_SMTP_USER: 'organiser@example.com', GMAIL_SMTP_APP_PASSWORD: 'testtesttesttest',
}
const row = () => ({
  id: ID, reservation_id: '11111111-1111-4111-8111-111111111111', claim_token: TOKEN, recipient_email: 'guest@example.com',
  payload: { event_name: 'Greens Heaven', full_name: 'Sam', reference: 'GH-2026-123',
    status: 'approved', review_note: null, amount_lkr: 6500,
    starts_at: '2026-10-31T12:00:00Z', venue: 'Solis Hotel' },
})
const request = (body = { notification_id: ID }, extra = {}) => new Request('https://edge.example/send-reservation-email', {
  method: 'POST', headers: { authorization: 'Bearer user-token', origin: env.SITE_URL, 'content-type': 'application/json', ...extra },
  body: JSON.stringify(body),
})

function fixture(options = {}) {
  const calls = []
  let state = 'pending'
  const handler = createEmailHandler({
    generateQr: async url => { calls.push(['qr', url]); if (options.qrError) throw new Error('QR failed'); return QRCode.toBuffer(url, { width: 360, margin: 4 }) },
    env: { ...env, ...options.env },
    createClient: (_url, key, configuration) => {
      calls.push(['client', key, configuration])
      if (key === env.SUPABASE_ANON_KEY) return {
        auth: { getUser: async token => { calls.push(['getUser', token]); return options.auth || { data: { user: { id: 'admin' } }, error: null } } },
        rpc: async name => { calls.push([name]); return { data: options.admin ?? true, error: null } },
      }
      return { rpc: async (name, args) => {
        calls.push([name, args])
        if (name === 'claim_notification') {
          if (state !== 'pending') return { data: [], error: null }
          state = 'sending'
          return { data: [options.row || row()], error: null }
        }
        assert.equal(name, 'finish_notification')
        assert.equal(args.p_claim_token, TOKEN)
        if (options.finishFails) return { data: false, error: { message: 'not saved' } }
        state = args.p_status
        return { data: true, error: null }
      } }
    },
    createTransport: configuration => {
      calls.push(['transport', configuration])
      return {
        sendMail: async message => { calls.push(['send', message]); if (options.smtpError) throw options.smtpError; return { accepted: ['guest@example.com'] } },
        close: () => calls.push(['close']),
      }
    },
  })
  return { handler, calls, state: () => state }
}

test('only a single mailbox is accepted; header injection and recipient lists are rejected', () => {
  assert.equal(isMailbox('a+b@example.co.uk'), true)
  for (const input of ['a@example.com\r\nBcc:steal@example.com', 'a@example.com,b@example.com', 'Name <a@example.com>', 'a@localhost']) {
    assert.equal(isMailbox(input), false)
  }
})

test('message uses stored recipient, HTML-safe content and fixed subject', () => {
  const notification = row()
  notification.payload.full_name = 'Sam\r\nBcc: someone'
  const message = buildMessage(notification, env.SITE_URL)
  assert.deepEqual(message.to, { address: 'guest@example.com' })
  assert.equal(message.subject, 'Greens Heaven: your ticket is confirmed')
  assert.match(message.html, /cid:ticket-qr@greensheaven/)
  assert.match(message.text, /Hi Sam  Bcc: someone,/)
  assert.match(message.text, /31 October 2026(?: at|,) 0?5:30 pm onwards/)
  assert.match(message.text, /https:\/\/greens.example\/dashboard/)
  assert.equal(message.disableFileAccess, true)
})

test('HTML injection is escaped and only approved emails include a ticket QR', () => {
  const notification = row()
  notification.payload.full_name = '<img src=x onerror=alert(1)>'
  notification.payload.review_note = '<script>alert(1)</script>'
  const message = buildMessage(notification, env.SITE_URL)
  assert.match(message.html, /&lt;img/)
  assert.doesNotMatch(message.html, /<script>|onerror=alert\(1\)>/)
  notification.payload.status = 'rejected'
  assert.doesNotMatch(buildMessage(notification, env.SITE_URL).html, /cid:ticket-qr/)
})

test('QR payload contains only the protected reservation lookup URL', () => {
  assert.equal(ticketVerificationUrl(row(), env.SITE_URL), 'https://greens.example/admin/dashboard?ticket=11111111-1111-4111-8111-111111111111')
  assert.throws(() => ticketVerificationUrl({ ...row(), reservation_id: 'javascript:alert(1)' }, env.SITE_URL))
})

test('Brevo uses its fixed SMTP host and a verified sender, never browser-supplied config', async () => {
  const config = { SMTP_PROVIDER: 'brevo', SMTP_USER: 'technical@smtp-brevo.com', SMTP_PASSWORD: 'server-only-key', SMTP_FROM_EMAIL: 'tickets@greensheavenxxvi.online' }
  assert.equal(smtpSettings(config).host, 'smtp-relay.brevo.com')
  assert.throws(() => smtpSettings({ ...config, SMTP_FROM_EMAIL: 'a@b.com\r\nBcc:x@y.com' }))
  const { handler, calls } = fixture({ env: config })
  assert.equal((await handler(request())).status, 200)
  const transport = calls.find(([name]) => name === 'transport')[1]
  assert.equal(transport.host, 'smtp-relay.brevo.com')
  assert.equal(transport.port, 465)
  const message = calls.find(([name]) => name === 'send')[1]
  assert.equal(message.from.address, config.SMTP_FROM_EMAIL)
  assert.equal(message.attachments[0].cid, 'ticket-qr@greensheaven')
  assert.deepEqual([...message.attachments[0].content.subarray(0, 8)], [137,80,78,71,13,10,26,10])
  assert.equal(message.disableUrlAccess, true)
})

test('QR generation failure sends no incomplete ticket email and can be retried', async () => {
  const { handler, calls, state } = fixture({ qrError: true })
  assert.equal((await handler(request())).status, 502)
  assert.equal(state(), 'failed')
  assert.equal(calls.some(([name]) => name === 'send'), false)
})

test('rejection messages never create or attach a ticket QR', async () => {
  const notification = row()
  notification.payload.status = 'rejected'
  const { handler, calls } = fixture({ row: notification })
  assert.equal((await handler(request())).status, 200)
  assert.equal(calls.some(([name]) => name === 'qr'), false)
  assert.equal(calls.find(([name]) => name === 'send')[1].attachments, undefined)
})

test('tampered stored recipients and invalid outcomes cannot form an email', () => {
  assert.throws(() => buildMessage({ ...row(), recipient_email: 'a@example.com,b@example.com' }, env.SITE_URL))
  const notification = row()
  notification.payload.status = 'pending'
  assert.throws(() => buildMessage(notification, env.SITE_URL))
})

test('SMTP ambiguity is blocked; only definite failures are retryable', () => {
  assert.equal(smtpFailure({ code: 'EAUTH' }).status, 'failed')
  assert.equal(smtpFailure({ responseCode: 550, command: 'DATA' }).status, 'failed')
  assert.equal(smtpFailure({ code: 'ETIMEDOUT', command: 'CONN' }).status, 'failed')
  assert.equal(smtpFailure({ code: 'ETIMEDOUT', command: 'DATA' }).status, 'unknown')
  assert.equal(smtpFailure({ code: 'ECONNRESET' }).status, 'unknown')
})

test('untrusted origins and unsigned callers cannot reach authentication or dispatch', async () => {
  const { handler, calls } = fixture()
  assert.equal((await handler(request(undefined, { origin: 'https://attacker.example' }))).status, 403)
  assert.equal((await handler(request(undefined, { authorization: '' }))).status, 401)
  assert.equal(calls.length, 0)
})

test('ordinary users and forged admin user_metadata cannot invoke service privileges', async () => {
  const { handler, calls } = fixture({ admin: false, auth: { data: { user: { id: 'guest', user_metadata: { role: 'admin' } } } } })
  assert.equal((await handler(request())).status, 403)
  assert.equal(calls.filter(([name]) => name === 'client').length, 1)
  assert.equal(calls.some(([name]) => name === 'claim_notification'), false)
})

test('invalid JWTs are rejected before the database admin check', async () => {
  const { handler, calls } = fixture({ auth: { data: { user: null }, error: { message: 'invalid jwt' } } })
  assert.equal((await handler(request())).status, 401)
  assert.equal(calls.some(([name]) => name === 'is_admin'), false)
})

test('request cannot override recipient or body; oversized input cannot dispatch', async () => {
  const { handler, calls } = fixture()
  assert.equal((await handler(request({ notification_id: ID, to: 'attacker@example.com' }))).status, 400)
  assert.equal((await handler(request({ notification_id: 'x'.repeat(1000) }))).status, 400)
  assert.equal(calls.some(([name]) => name === 'claim_notification'), false)
})

test('valid admin sends through TLS and persists the matching claim token', async () => {
  const { handler, calls, state } = fixture()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, 'sent')
  assert.equal(state(), 'sent')
  const [, transport] = calls.find(([name]) => name === 'transport')
  assert.equal(transport.port, 465)
  assert.equal(transport.secure, true)
  const [, message] = calls.find(([name]) => name === 'send')
  assert.deepEqual(message.envelope.to, ['guest@example.com'])
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.SITE_URL)
})

test('concurrent calls send only the notification awarded by the atomic claim', async () => {
  const { handler, calls } = fixture()
  const responses = await Promise.all([handler(request()), handler(request())])
  const outcomes = await Promise.all(responses.map(response => response.json()))
  assert.deepEqual(outcomes.map(value => value.status).sort(), ['not_pending', 'sent'])
  assert.equal(calls.filter(([name]) => name === 'send').length, 1)
})

test('SMTP success followed by status persistence failure is never sent again', async () => {
  const { handler, calls, state } = fixture({ finishFails: true })
  assert.equal((await (await handler(request())).json()).status, 'unknown')
  assert.equal(state(), 'sending')
  assert.equal((await (await handler(request())).json()).status, 'not_pending')
  assert.equal(calls.filter(([name]) => name === 'send').length, 1)
})

test('ambiguous DATA timeout becomes unknown and cannot be automatically retried', async () => {
  const { handler, state } = fixture({ smtpError: { code: 'ETIMEDOUT', command: 'DATA' } })
  assert.equal((await (await handler(request())).json()).status, 'unknown')
  assert.equal(state(), 'unknown')
  assert.equal((await (await handler(request())).json()).status, 'not_pending')
})

test('missing SMTP configuration leaves notification pending', async () => {
  const { handler, calls, state } = fixture({ env: { GMAIL_SMTP_APP_PASSWORD: '' } })
  assert.equal((await handler(request())).status, 503)
  assert.equal(state(), 'pending')
  assert.equal(calls.some(([name]) => name === 'claim_notification'), false)
})
