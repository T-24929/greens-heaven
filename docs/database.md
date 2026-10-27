# Greens Heaven database setup

The migrations in `supabase/migrations/` supply the event, reservation workflow, private receipt storage, admin permissions, decision history, and email outbox. Apply them in filename order. The first migration is intended for a fresh Supabase project; the second adds sequential `GH-001` style references, Sri Lanka-only phone validation, and NIC/school identity fields for new reservations. Existing reservation references are preserved, and existing rows keep those newly added identity fields empty. The `20261025095033_online_reservation_cash_payment.sql` migration lets organizers record cash against an existing online reservation and sends that payment through the normal review flow. Applying migrations and configuring Auth are separate from running the React app. No remote project was changed while building this code.

## Event and bank details

The seeded event is **Greens Heaven, 31 October 2026 at 5:30 p.m. in Asia/Colombo, Solis Hotel**, with one **Rs. 7,000** ticket per account. Prices are fixed in Sri Lankan rupees throughout the app and database. The timestamp includes its `+05:30` offset. Reservations close automatically at the event start, or earlier when an organizer sets `reservations_open = false`.

The initial migration uses demo details. The `20261015214713_update_event_bank_details.sql` migration replaces them with the organizer-provided account below and sets `is_demo = false`. This update is prepared locally; the connected Supabase account does not have access to the app's project (`dqpuhrsytwibeomkrtic`), so it has not been applied remotely. Open that project's SQL Editor and run the migration file, then verify the result with the query below. Until then, the app correctly continues to show the database's existing demo details.

- Bank: Pan Asia Bank
- Branch: Homagama
- Account holder: K K V N C Kariyawasam
- Account number: 2076 1000 2552

Verification:

```sql
select bank_name, account_name, account_number, branch, is_demo
from public.bank_details
where event_id = 'greens-heaven-2026';
```

For later changes, update the event's row as a project administrator:

```sql
update public.bank_details
set bank_name = 'YOUR BANK',
    account_name = 'YOUR ACCOUNT NAME',
    account_number = 'YOUR ACCOUNT NUMBER',
    branch = 'YOUR BRANCH',
    payment_instructions = 'Use your reservation reference as the transfer reference.',
    is_demo = false
where event_id = 'greens-heaven-2026';
```

Only signed-in users with a verified email can read bank details. Bank details can be removed temporarily: users can still reserve, but receipt upload/submission will be blocked until the details exist again. The price is copied from the database at reservation creation, so changing browser requests cannot lower it. This release has no capacity limit, seat map, ticket quantity selector, or expiry of unpaid reservations; agree on those rules before introducing limited inventory.

## Configure Supabase

1. Create/select the intended Supabase project and apply the migration through your usual reviewed migration workflow. The SQL Editor can also run the file on a fresh project. Keep the `private` schema **out of** Data API exposed schemas. `public` is the client API schema.
2. Enable email/password sign-in, **email confirmation**, and the Google provider. Configure your Google OAuth credentials in Supabase Auth. Register the Supabase callback URL in Google, and allow only your app's actual callback URLs in Supabase Auth. Leave anonymous sign-ins disabled. The database also rejects anonymous and unverified accounts.
3. Set the app's public Supabase URL and publishable key. Never put a service-role key, SMTP password, Google client secret, or database password in a `VITE_` variable. The email sender uses server-only secrets; follow `docs/notifications.md`.
4. Set the actual site URL and the explicit callback/reset URLs used by your deployment. If using an admin subdomain, configure that origin too and sign in there separately. A second repository is unnecessary: serve the same app on both hosts and open `/admin/dashboard` on the admin host. The attendee dashboard is `/dashboard`. The database checks admin membership regardless of host or route.
5. After creating the organizer's verified account, grant admin membership with its Auth user ID using the SQL Editor:

```sql
insert into private.admins(user_id)
values ('REPLACE-WITH-THE-ORGANIZER-AUTH-USER-UUID');
```

To revoke access, delete that membership row. Admin checks read the current membership table on each request, so revocation does not depend on a JWT refresh. Setting a role in `user_metadata`, changing browser state, or visiting `/admin/dashboard` does not grant access. Do not expose a client-facing method for writing this table.

## Client API

Public reads: `event_settings`. Verified attendee reads: `bank_details`, their own `reservations`, and their own `receipt_submissions`. Admins can read every reservation, its receipt history, `review_history`, and `notification_outbox`.

| RPC | Parameters | Result |
| --- | --- | --- |
| `is_admin` | none | Boolean |
| `reserve_ticket` | `p_full_name`, `p_whatsapp` (Sri Lankan mobile normalized to `+94`), `p_nic_number` (old or new NIC format), optional `p_school_index_number` (five digits), `p_school_joined_year` | Reservation row; repeat requests return the same ticket |
| `submit_receipt` | `p_reservation_id`, `p_receipt_path` | Updated reservation row |
| `review_reservation` | `p_reservation_id`, `p_decision` (`approved` or `rejected`), `p_receipt_path` of the receipt the admin viewed, optional `p_note` | `{ reservation, notification_id }` |
| `claim_notification` | `p_notification_id` | Zero or one outbox rows; **service role only** |
| `finish_notification` | `p_notification_id`, `p_claim_token`, `p_status`, optional `p_error` | Boolean; **service role only** |

New tickets receive a database-generated reference (`GH-001`, `GH-002`, …) and start at `awaiting_payment`. The number is a readable reservation reference; gaps can occur if a database transaction rolls back. A submitted receipt changes the status to `pending_review`. Retrying that same submitted path returns the existing pending state, so a lost network response does not create duplicate history. An admin may approve or reject only that pending receipt. Rejection requires a reason; the attendee can then upload a **new** file and submit again. An approved ticket cannot be changed through the attendee API. Each review locks the reservation and verifies its current receipt path, so a stale admin screen cannot approve a replacement receipt it has not seen. Admin decisions append an immutable audit row and queue the matching email in the same transaction.

Tables are read-only for browser clients, including admins. Narrow RPCs control mutations. Security-definer implementations are in `private`, pin an empty search path, validate identity/ownership or protected admin membership, and have explicit execute grants. Public RPC wrappers use security invoker. Service-only email functions use role grants instead of an attendee identity, because they are called by the authenticated server worker.

## Receipts

The `receipts` bucket is private. Upload JPEG, PNG, or PDF files of at most **5 MiB** with a new random filename and `upsert: false`:

```text
<auth-user-uuid>/<reservation-uuid>/<random-uuid>.pdf
```

The Storage API must set `owner_id` to the authenticated account, as it normally does when using the attendee's session. Uploads must belong to an existing unpaid/rejected reservation. Submission verifies the actual stored object's path, owner, MIME metadata, and size, and preserves every submitted receipt in history. There are no client update/delete policies, so an attendee cannot replace reviewed evidence. The upload policy locks the reservation while enforcing a ten-object limit. Enable project upload/rate limits and monitor storage usage before a large public launch.

Only the ticket owner or an organizer can request the file through storage RLS. The app requests signed links with a **60-second** lifetime. Signed links are bearer links: anyone possessing one can open it until expiry. Do not log or send them in notifications. Supabase's direct signed-URL API does not enforce this app's 60-second choice for an otherwise authorized client; require a dedicated server download endpoint if the lifetime must be a strict policy. File type and size restrictions are not malware scanning; review documents in a separate browser tab, and do not embed receipt HTML in the app.

## Email delivery records

Review emails contain a snapshot of the decision and the reservation's verified email address. A service-only atomic claim moves `pending`/`failed` to `sending` with a fresh claim token. A second worker cannot claim the same send. Old rejection emails cannot be claimed after a new receipt or review supersedes them.

The sender records `sent`, a definite `failed` send, or `unknown` when SMTP might have accepted the message before the connection failed. It does **not** reclaim `sending` or `unknown` automatically, because SMTP cannot guarantee exactly-once delivery. Retries of definite failures are capped at five. Inspect the Gmail Sent folder/server logs before manually resetting an ambiguous row in the SQL Editor. A crash between claiming and completion also leaves `sending` for investigation. Database state is authoritative even if email delivery fails.

## Local verification

`supabase/tests/authorization.sql` runs in a transaction and rolls back all fixtures. It switches actual Postgres roles to check anonymous, unverified, attendee, other-attendee, admin, and service-role behavior. Run it against a **local** migrated Supabase database as postgres with your preferred SQL client. It covers server-controlled price/status, cross-account isolation, private receipt reads, upload ownership, receipt immutability, rejection/resubmission, stale reviews, duplicate decisions, atomic outbox claims, and ambiguous delivery retries.

Run the included PGlite test harness without Docker:

```sh
node supabase/tests/run.mjs
```

The harness passes 70 authorization and workflow assertions. PGlite uses real PostgreSQL permission checks but stubs the surrounding Auth and Storage tables. It does not exercise live OAuth, confirmation emails, the Storage HTTP server, Edge Functions, or SMTP. Before launch, run the SQL tests on local Supabase, review Supabase security advisors, and complete a two-attendee/one-admin test through the real app. Keep any production receipt retention/removal operation as a separate privileged maintenance procedure so reviewed payment evidence cannot be silently edited.

References: [Database functions](https://supabase.com/docs/guides/database/functions), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Identity rules and recent migrations

Apply all pending migrations in filename order, including minimum school year,
editable attendee details, and unique attendee identity. These are local migration
files until applied to the hosted project.

- Joining years: 2010–2026 for new reservations and edits.
- The attendee UI is forward-only after reservation: /reserve redirects to payment or dashboard.
  The restricted update RPC exists for awaiting-payment/rejected rows but is not exposed by this UI.
- Account, NIC, email (case insensitive), and supplied school index cannot be reused.
- NIC uniqueness also matches equivalent legacy and 12-digit NIC formats.
- Names, WhatsApp numbers and joining years may repeat; a shared contact number is not identity.
- The optional school index remains nullable.
- Identity uniqueness applies to all reservation statuses, including rejected receipts.
- Migration stops on existing duplicates without deleting or merging anything. Review affected
  reservations with the organizers before retrying. Do not disable the indexes to bypass this.
- Database indexes enforce uniqueness on both create and edit, including concurrent requests.
  Local PGlite tests verify conflicts; they are not a live multi-connection load test.
- NIC format validation and uniqueness do not verify ownership or government authenticity.
