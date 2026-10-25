# Greens Heaven

React + Vite, Tailwind, local shadcn/Base UI components, React Bits interactions, and Supabase. Dark event branding with responsive landing, sign-in and reservation pages.

Event: **31 October 2026, 5:30 pm onwards, Solis Hotel**. Isipathana College 2023 O/L and 2026 A/L batch. **Rs. 6,500 per ticket**, one reservation per verified account.

## What is implemented

- Event landing page and FAQs.
- Public refund policy at `/refund-policy`: no personal cancellation refunds; verified duplicate payments and organizer cancellation are covered, subject to consumer rights. Requests are handled directly through the event's Instagram account.
- Email/password registration, confirmation, sign in, password recovery, email sign-in links, and Google sign in using Supabase Auth. Attendees choose a website password; the website never asks for their Gmail password.
- Attendee name, Sri Lankan NIC, optional five-digit school index, school joined year, and local WhatsApp number; server-priced reservations, private bank instructions, receipt upload, and status tracking.
- Organizers can record physical cash against an existing online reservation. The cash record enters the same review and email flow as a bank receipt; walk-in cash registrations keep their existing confirmation flow.
- Private JPG/PNG/PDF receipts, up to 5 MB. Client file signature checks improve feedback; these are not a malware scan or proof of payment.
- Admin receipt review, approval/rejection, rejection notes, and immutable review/receipt history.
- Styled approval/rejection emails through a server-side Brevo SMTP function, a transactional outbox, and safe retry controls. Approved tickets include an inline QR for protected organizer lookup; this is not single-use check-in.
- Prepared WhatsApp links using `wa.me`; the organizer reviews and sends the message in WhatsApp.
- Row-level security, restricted database RPCs, trusted admin membership, server-side price/status control, and 60-second private receipt links.

## Run locally

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env` if you do not already have one, then set the Supabase project URL and **publishable** key. Restart Vite after changing environment variables. Never put a service role key, SMTP password, or other secret in a `VITE_*` variable.

The public landing and sign-in screens can be previewed before the database is set up. Reservations need the supplied migration; the application does not silently replace real Supabase requests with mock data.

## Deploy with GitHub and Netlify

Follow [Netlify deployment](docs/netlify-deployment.md). `netlify.toml` sets Node 22, verified builds, and `dist` output. Add the two public Supabase environment variables in Netlify before deploying. Skills, agent files, secrets and generated files are excluded from Git.

## Connect Supabase

Follow the [beginner setup guide](docs/setup-guide.md) for step by step Dashboard and Google Cloud instructions. For technical database and email details, see [database setup](docs/database.md) and [domain and email setup](docs/email-setup.md).

The existing local environment points to a project that was not available through the connected Supabase account during development. No remote schema, auth settings, or functions were changed. No live email was sent.

## Bank details

The third migration, `20261015214713_update_event_bank_details.sql`, replaces the original demo account with the organizer-provided Pan Asia Bank account: **2076 1000 2552**, Homagama, **K K V N C Kariyawasam**, and sets `is_demo = false`. Apply it to the intended project after the first two migrations. This local change has not been applied to the hosted database.

See [database setup](docs/database.md) for the exact update and verification query. Refund requests are handled by contacting the organizers; there is no refund request database or payout automation.

## Admin URL: one repository

- Attendee home and ticket tracking: `/dashboard`.
- Reservation: `/reserve` (`/ticket` also works). Saving a reservation opens `/payment` automatically.
- Payment: `/payment`. Bank details and receipt upload live here. Attendees who pay an organizer in person can ask the organizer to record cash against their reservation. Submitting a bank receipt returns the attendee to `/dashboard` to track review.
- Admin: `/admin/dashboard`. Open an online reservation to record collected cash, then approve or return the cash record through the existing payment review.

A separate repository is not needed. Access is checked by Supabase on every protected operation; a hidden route or subdomain is not the security boundary. If you later use an admin subdomain, open `/admin/dashboard` on it. Each origin has its own browser session, so sign in again there. Add that origin’s callback URLs to Supabase and include it in the email function’s `ALLOWED_ORIGINS`.

Vercel routing/security headers are in `vercel.json`. Netlify-style equivalents are in `public/_redirects` and `public/_headers`. Other hosts must serve `index.html` for application routes and send equivalent headers. The CSP permits standard `*.supabase.co` project endpoints; update `connect-src` and `img-src` if you use a custom Supabase domain. Configure HTTPS on your host. Update the social image URL to an absolute production URL when the domain is known. The site currently uses `noindex` while configuration and testing are in progress.

## Checks

```sh
npm run lint
npm test
npm run test:db
npm run build
npm audit
```

The database test runner executes the real migration and role/RLS assertions in a disposable PGlite PostgreSQL instance. It stubs Supabase’s Auth/Storage infrastructure, not application authorization. It does not exercise the hosted Storage HTTP API, Google OAuth, email delivery, or real browser accounts. The notification tests inject transport and auth boundaries; they never send messages.

Before opening live payments, run the hosted flow with two disposable attendee accounts and an admin: reserve, upload, reject, replace, approve, verify email and WhatsApp links, then confirm the second attendee cannot fetch the first attendee’s reservation or receipt. Confirm Auth email links and Google callbacks on each actual domain. Test on a real phone as well; viewport emulation does not validate the mobile keyboard or safe areas.

## Main files

- `src/pages/`: event, auth, reservation, and admin flows.
- `src/lib/`: input validation, display helpers, WhatsApp messages, and focused tests.
- `src/utils/supabase.js`: the single browser client.
- `src/components/ui/button.jsx`: local shadcn/Base UI button, ready to restyle.
- `supabase/migrations/`: schema, authorization, receipt rules, and notification outbox.
- `supabase/functions/send-reservation-email/`: authenticated email dispatcher.
- `docs/`: database and email setup.

The unused installed shadcn generator was removed from runtime dependencies after its transitive dependencies triggered an audit advisory. Local shadcn components and Base UI remain. A component generator is not required to run the site.
# greens-heaven

## Organizer and event-day desks

The mobile admin panel includes reservation queues, confirmation dialogs, email delivery updates, and separate entrance and photo booth check-in. See [event-day setup](docs/event-day.md) for the required migration, access rules, camera checks and photographer workflow.
