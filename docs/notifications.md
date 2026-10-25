# Reservation emails and WhatsApp

The admin dashboard saves an approval or rejection and its email notification in one database transaction. It then invokes the `send-reservation-email` Edge Function with the notification ID. Email failure does not undo the payment decision. The dashboard shows delivery status separately and offers a retry for a definite failure.

Attendees use their website password, Google, or an email sign-in link. They never provide a Gmail password to this website.

## Set up email delivery

Follow the [Brevo / Namecheap setup guide](email-setup.md) for `tickets@greensheavenxxvi.online`. It covers domain verification, Supabase Auth SMTP, branded Auth templates, Edge Function secrets, and deployment. Auth email settings and reservation email secrets are separate.

The function defaults to Brevo using `SMTP_PROVIDER=brevo`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM_EMAIL`. The transport is fixed to `smtp-relay.brevo.com:465`, with TLS and certificate checks. For an existing Gmail setup, `SMTP_PROVIDER=gmail` plus the legacy `GMAIL_SMTP_USER` and `GMAIL_SMTP_APP_PASSWORD` remain supported. Do not store either provider's credentials in frontend variables.

Emails contain both plain text and escaped HTML. Approval messages include a locally generated inline PNG QR; rejection messages do not. The QR contains only a reservation UUID in an admin URL, with no attendee identity details. Scanning opens the reservation behind normal admin authorization. It does not redeem the ticket or mark a person as checked in.

File and remote URL loading remain disabled. The only attachment is a generated in-memory PNG; no receipt or user-supplied file is attached. Supabase blocks SMTP ports 25 and 587 for Edge Functions, so this function uses 465. See [Edge Function limits](https://supabase.com/docs/guides/functions/limits).

SMTP acceptance does not guarantee inbox delivery. Check Brevo's transactional logs and the attendee inbox when testing. No live SMTP test has been performed here.

## API contract

Call from the signed-in admin's Supabase client to deliver a queued notification:

```js
const { data, error } = await supabase.functions.invoke('send-reservation-email', {
  body: { notification_id: notificationId },
})
```

To send a fresh ticket email from an approved reservation, the admin dashboard calls the same function with `{ reservation_id, resend: true }`. The database checks that the reservation is still approved, takes the current attendee email and ticket details from the saved record, and creates a separate outbox attempt. It never changes the payment or approval status. The button is unavailable while a current ticket email is pending, sending, or has uncertain delivery.

The function verifies the user with `auth.getUser(token)`, then runs the trusted `is_admin()` database lookup using that user's credentials. User-editable profile metadata cannot grant access. Only after these checks does it create the privileged client. A request cannot provide an email address, SMTP configuration, message content, or a reservation decision.

The request accepts only a notification UUID, or an approved reservation UUID with the resend flag, in a small JSON body. Browser calls must come from an allowed origin. CORS is an additional browser restriction; JWT verification and the database role check enforce access for every caller, including non-browser callers.

| Response | Meaning |
| --- | --- |
| `200`, `status: "sent"` | The SMTP provider accepted the message and the result was saved. |
| `200`, `status: "not_pending"` | Another worker claimed it, it was already sent, it is obsolete, it needs manual review, or the attempt limit was reached. Refresh the outbox row. |
| `502`, `status: "failed"` | No email was sent: invalid stored payload or a definite SMTP rejection/connection failure. |
| `502`, `status: "unknown"` | Delivery may have happened; do not automatically retry. |
| `400` | Invalid request body. |
| `409` | The ticket is not approved, or its current email is pending or needs a delivery check. |
| `401` / `403` | Invalid user session, disallowed origin, or no admin access. |
| `503` | Missing setup or an authentication/database dependency failed. The error message is safe to display. |

Supabase treats non-2xx results as function errors. Read the error response JSON when available, and always refresh `notification_outbox` for the saved state. Do not label the reservation decision as failed merely because notification dispatch failed.

## Concurrent sends, retries, and recovery

`claim_notification` atomically changes only an eligible `pending`/`failed` row to `sending`, returns a fresh claim token, and increments the attempt count. At most five attempts are allowed. The current reservation status, reviewed receipt, and review timestamp must still match that notification. This prevents an old rejection from being retried after a new receipt is submitted or approved. A manual resend creates a new ticket notification row and is allowed only while its saved approval is still current.

`finish_notification` accepts only the worker's matching claim token. A second caller cannot send while the first holds the claim. Recipient address and message fields are taken from the snapshot saved by the review transaction, not from the browser or a later profile edit. A fixed Message-ID makes the message traceable in provider logs; it does **not** make SMTP exactly-once.

Only an explicit SMTP rejection or a definite pre-send failure becomes `failed`. A timeout after message transmission, a worker interruption, or a status-write failure can leave `unknown` or `sending`. Those rows are never reclaimed automatically, because resending could send a duplicate.

For a stuck `sending` or `unknown` row, a project administrator should inspect the provider's transactional delivery logs using the notification's Message-ID (`greens-heaven-NOTIFICATION_UUID@SITE_HOST`). Wait until the old function invocation has ended. If delivery is confirmed, reconcile the row to `sent` through a trusted database maintenance session. Only after confirming the message was not accepted should the administrator reset it to `failed` for a retry. Preserve the previous claim, timestamps, and error in an operational audit record. If delivery cannot be established, leave it blocked and contact the attendee manually. There is intentionally no one-click override for uncertain delivery.

The approval/rejection note appears in both email alternatives, with HTML characters escaped. Do not put private organiser notes in this field; it is intended for the attendee.

## WhatsApp

The admin dashboard builds a `wa.me` link using the attendee's validated Sri Lankan mobile number and a prefilled outcome message. The attendee enters a local number such as `077 123 4567`; the site normalizes it for WhatsApp. Opening the link lets the organiser review and send in WhatsApp. A `wa.me` link does not send automatically and cannot report delivery to this site. No WhatsApp credentials or automated sending are used.

## Verification

Run the offline tests from the repository root:

```text
node --test supabase/functions/send-reservation-email/handler.test.mjs
```

The tests cover admin gating, invalid sessions, injected recipients/content, origin restrictions, HTML escaping, approval-only QR generation, fixed Brevo/Gmail TLS transport, concurrent claims, SMTP ambiguity, and success followed by a failed status write. They use fake clients and a fake transport; they never send mail. Database authorization and atomicity are tested separately in `supabase/tests`.

Check the function with Deno:

```text
deno check --config supabase/functions/send-reservation-email/deno.json supabase/functions/send-reservation-email/index.ts
```

No production email is sent by the tests, and SMTP credentials still need to be configured and tested against the intended Supabase project.

### Confirmation links and previews

Use `SITE_URL=https://greensheavenxxvi.online` for `send-reservation-email`, then redeploy that function after template changes. WhatsApp drafts link to the same production dashboard. Confirmed-ticket emails include a QR for the organizer to scan; attendees do not need an account at the entrance. The QR identifies the reservation, while only signed-in organizers can view its current status.

Netlify's `netlify/edge-functions/share-preview.js` supplies route-specific Open Graph and Twitter metadata in the HTML response. It runs after deployment, not in the Vite development server. The home, reserve, login, payment and dashboard links use public event artwork and copy only. Query strings and private ticket data are never included. Share platforms may cache older previews.
