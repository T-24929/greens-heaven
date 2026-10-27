# Email setup for greensheavenxxvi.online

Use **Brevo Free**, with **Greens Heaven XXVI <tickets@greensheavenxxvi.online>** as the sender. Your Namecheap domain is enough to authenticate a sender; buying a mailbox is optional. This setup covers account confirmation, email sign-in links, password resets, and ticket decision emails.

Brevo currently permits **300 emails per day** on Free, shared by all these messages. One signup confirmation plus one approved ticket uses two emails; resets, login links and retries use more. Unused daily allowance does not accumulate. Check expected launch-day traffic against that limit. [Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)

The code is prepared locally. DNS, hosted Auth settings, SMTP secrets and deployment still need to be completed in your accounts. No test email has been sent.

## 1. Create the Brevo sender

1. Sign up at [Brevo](https://www.brevo.com/), verify your email, and complete its account checks. Use accurate organizer details. Confirm transactional email sending is enabled for your account.
2. Open **Settings → Senders, Domains & Dedicated IPs → Domains**. Add `greensheavenxxvi.online` and choose manual authentication if needed.
3. Keep the DNS records Brevo gives you open. The verification code, DKIM and DMARC records are specific to your domain/account; copy those exact values, not examples from a tutorial.
4. In Namecheap, open **Domain List → Manage** next to `greensheavenxxvi.online`. Check **Nameservers**. If Namecheap manages DNS, open **Advanced DNS → Host Records → Add New Record**. If nameservers point to another provider, add the records at that provider instead.
5. Add each Brevo record with its exact type and value. In Namecheap, the root host is `@`; a host such as `brevo1._domainkey.greensheavenxxvi.online` is normally entered as `brevo1._domainkey`. Do not append the domain twice. Leave TTL on Automatic.
6. Keep existing website records. If a DMARC or SPF record already exists, reconcile it using Brevo's instructions instead of adding a second conflicting record. Do not change nameservers just to authenticate email.
7. Save, then return to Brevo and click **Authenticate / Verify**. Wait until the domain is authenticated; DNS changes may take time.
8. Under **Senders**, add sender name **Greens Heaven XXVI** and address **tickets@greensheavenxxvi.online**. Complete any sender verification shown.

Reference: [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/35337929909778-Set-up-your-domain-in-Brevo).

## 2. Receive replies, if wanted

Brevo sends outgoing mail; it is not a mailbox. To receive attendee replies at `tickets@greensheavenxxvi.online`, set up a mailbox or forward that address to the organizer's existing inbox.

Namecheap offers free forwarding when the domain uses its supported DNS service. In **Advanced DNS → Mail Settings**, choose **Email Forwarding**, then add the `tickets` alias and destination under the domain's **Redirect Email** section. Follow [Namecheap's forwarding instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/308/2214/how-to-set-up-free-email-forwarding/). Do not replace existing mail settings if you already have working mail. Forwarding receives messages; it does not supply SMTP credentials.

## 3. Get SMTP credentials

1. Open [Brevo → SMTP & API → SMTP](https://app.brevo.com/settings/keys/smtp).
2. Copy the **SMTP login** shown there. It may differ from both your Brevo account email and your sender address.
3. Generate an **SMTP key**, giving it a name such as `Greens Heaven Supabase`.
4. Save it privately. Enter it only in Supabase's SMTP settings and Edge Function secrets below. Do not put it in `.env`, a `VITE_` variable, source code, or chat. An API key or your normal account password is not the SMTP key.

Reference: [Brevo SMTP credentials](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

### If Brevo says unauthorized IP addresses are blocked

Your SMTP screen may show this restriction as enabled. The ticket sender runs in Supabase Edge Functions, which do not provide stable outbound IP addresses. Adding your home IP or the Netlify website IP will not authorize that sender. See [Supabase's egress-IP explanation](https://supabase.com/docs/guides/troubleshooting/why-supabase-edge-functions-cannot-provide-static-egress-ips-for-whitelisting-3d78b0).

For this direct serverless SMTP setup, open **Brevo → Settings → Security → Authorized IPs**. Under **Blocking unauthorized IP addresses**, select **Deactivate for SMTP** and confirm. API-key restrictions can remain unchanged. This removes the IP restriction for SMTP keys, so anyone holding a valid key could use it from any IP; keep the key only in Supabase's server settings and monitor delivery logs. If your organization requires IP restrictions, use a separately configured relay with a static outbound IP instead. [Brevo's settings](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security)

Brevo may display port 587 as its default. Port **465 with TLS** is also supported and is used by this project's email function. Keep the function on 465 because Supabase Edge Functions block outbound ports 25 and 587.

## 4. Connect Supabase Auth

Open the **Greens Heaven** project in Supabase. The current local app points to project reference `dqpuhrsytwibeomkrtic`; confirm that this is your intended project.

In **Authentication → Emails → SMTP Settings**, enable Custom SMTP:

| Field | Value |
| --- | --- |
| Sender email | `tickets@greensheavenxxvi.online` |
| Sender name | `Greens Heaven XXVI` |
| SMTP host | `smtp-relay.brevo.com` |
| Port | `465` |
| Username | The SMTP login copied from Brevo |
| Password | Your Brevo SMTP key |
| Minimum interval per user | Keep `60` seconds |

Save. Review **Authentication → Rate Limits**: custom SMTP initially defaults to 30 Auth emails/hour. Set a sensible hourly allowance for launch traffic while keeping the combined daily Brevo limit in mind. Disable email link tracking for authentication messages if enabled, so links are not rewritten. [Supabase SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp)

Under **Authentication → Sign In / Providers → Email**, keep email confirmation enabled and set **Minimum password length = 6**. The website and local Supabase config already use six; changing a local file does not update the hosted Auth setting.

## 5. Set working return URLs

Buying the domain does not deploy the website. While developing, use `http://localhost:5173` as the Site URL. Once the website is hosted and HTTPS works, set **Authentication → URL Configuration → Site URL** to:

```text
https://greensheavenxxvi.online
```

Add these **Redirect URLs**:

```text
https://greensheavenxxvi.online/auth/confirm
https://greensheavenxxvi.online/auth/confirm?next=attendee
https://greensheavenxxvi.online/auth/confirm?next=admin
https://greensheavenxxvi.online/auth/confirm?next=recovery
https://greensheavenxxvi.online/auth/confirm?next=account-setup
https://greensheavenxxvi.online/auth/callback
https://greensheavenxxvi.online/auth/callback?next=admin
https://greensheavenxxvi.online/reset-password
http://localhost:5173/auth/confirm
http://localhost:5173/auth/confirm?next=attendee
http://localhost:5173/auth/confirm?next=admin
http://localhost:5173/auth/confirm?next=recovery
http://localhost:5173/auth/confirm?next=account-setup
http://localhost:5173/auth/callback
http://localhost:5173/auth/callback?next=admin
http://localhost:5173/reset-password
```

Use the actual local port if it changes. If you use `www` or an admin subdomain, also allow the exact URLs for that origin.

## 6. Paste the branded Auth templates

In **Authentication → Emails → Templates**, open each template below. Copy the entire matching HTML file into the body field, set the subject, and save:

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm signup | [confirm-signup.html](../supabase/templates/confirm-signup.html) | Confirm your email · Greens Heaven XXVI |
| Invite user | [invite.html](../supabase/templates/invite.html) | Your Greens Heaven account is ready |
| Magic Link | [magic-link.html](../supabase/templates/magic-link.html) | Your sign-in link · Greens Heaven XXVI |
| Reset Password | [reset-password.html](../supabase/templates/reset-password.html) | Reset your Greens Heaven password |

For Confirm signup, Magic Link, Invite user, and Reset Password, keep `{{ .RedirectTo }}` and `{{ .TokenHash }}` in the secure link. Each link opens `/auth/confirm`, where the attendee taps once to verify; password recovery then opens the password form. This avoids PKCE's same-browser requirement and removes the reset-code step for new requests. Invite and account-setup recovery redirects come from the account setup function; self-service password resets use the current site origin. Local files and `config.toml` do not update hosted Auth templates: paste each matching file in **Authentication → Emails → Templates** and save. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

After saving the hosted templates, request a fresh sign-in link or resend the optional account setup link. Previously delivered links keep their old format.

## 7. Connect ticket confirmation emails

Auth SMTP does not configure reservation emails. In **Edge Functions → Secrets**, add:

| Secret | Value |
| --- | --- |
| `SMTP_PROVIDER` | `brevo` |
| `SMTP_USER` | The SMTP login from Brevo |
| `SMTP_PASSWORD` | Your Brevo SMTP key |
| `SMTP_FROM_EMAIL` | `tickets@greensheavenxxvi.online` |
| `SITE_URL` | `https://greensheavenxxvi.online` once hosted |
| `ALLOWED_ORIGINS` | `https://greensheavenxxvi.online,http://localhost:5173` |

Origins have no trailing slash or page path. While testing before hosting, use `http://localhost:5173` for `SITE_URL` too; emailed links will then only work on the development computer. Change it before sending real tickets. Add any actual admin origin to `ALLOWED_ORIGINS`.

Supabase supplies the function's server keys automatically. Do not put its service-role key in the frontend. Apply all pending database migrations first, including the supplied bank update.

From PowerShell in the project folder, deploy with the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started):

```powershell
npx supabase login
npx supabase functions deploy send-reservation-email --project-ref dqpuhrsytwibeomkrtic
```

Confirm the project reference before running the deploy command. Keep JWT verification enabled. The function uses SMTP over TLS on port 465 and builds the QR locally; it does not send attendee data to an external QR website.

When an admin approves a receipt or confirms physical cash, the review queues and attempts the confirmation email. It includes the attendee's reference, event details and a QR image. No attendee login is needed at the entrance; an optional account is only for managing the reservation online. A definite send failure can be retried from the admin dashboard. Rejection emails explain the next step and have no ticket QR.

The QR opens that reservation in `/admin/dashboard?ticket=...`. Only signed-in organizers with admin rights can read it. It checks current approval status; it is **not a single-use entry/check-in system**. The decorative tear preview does not affect a real reservation.

## 8. Test before inviting attendees

1. Register your own test account with a six-character website password. Confirm the branded email arrives and its link works.
2. Sign out and request an email sign-in link. Open it from the email app, tap the confirmation button, and confirm the ticket dashboard opens.
3. Use **Forgot password?**, follow the reset email, then sign in with the new password.
4. Reserve a test ticket and upload a sample receipt. Approve it from an organizer account. Verify the ticket email and visible QR in your inbox, including on a phone.
5. Scan the QR as an organizer: it should open the right reservation. Signed-out viewers must sign in; ordinary attendee accounts must not see admin details.
6. Check **Brevo → Transactional → Email logs** for accepted, delivered or bounced messages. A saved `sent` status means SMTP acceptance, not guaranteed inbox delivery.

If a notification says **Delivery needs checking**, inspect Brevo logs before retrying. See [notification recovery](notifications.md#concurrent-sends-retries-and-recovery). Local tests do not prove live SMTP delivery, DNS correctness or mobile email-client rendering.
