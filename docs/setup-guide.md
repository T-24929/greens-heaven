# Greens Heaven setup guide

Follow these steps in order. You will need a Supabase account, a Google account for the organiser, and a Google Cloud project for Google sign in. For the custom email sender, also keep your Namecheap and Brevo accounts available.

## 1. Choose or create the Supabase project

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the project for Greens Heaven. The project should be yours or the event organiser's. Do not use a project belonging to an unrelated website.
2. Open **Project Settings → API Keys**. Copy the **Project URL** and a **Publishable key** (starts with sb_publishable_). You may see the older anon public key too; the publishable key is preferred.
3. In the Greens Heaven project folder, open the .env file. Replace only these two values:

   ~~~env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ~~~

   Copy each value directly from your own Supabase project. Do not copy the example words above. Do not put a service role key, a secret key, a Google client secret, or a Gmail password here. Anything starting with VITE_ is included in the public website. The build rejects Supabase service role and secret keys.

4. Save .env, then restart the development server. Its terminal shows the web address, such as http://localhost:5173. Keep that exact address open for the next steps.

If you already have a Supabase project with other tables or users, pause before applying the first migration in step 2. It is written for a fresh project. Do not rerun it on a project where some of its tables already exist. If you already ran the Greens Heaven ticketing migration successfully, apply only migrations you have not run yet, in filename order; do not rerun the first one.

## 2. Add the ticketing database

This creates the event, the Rs. 7,000 price, demo bank details, reservation tables, admin permissions, and private receipt storage.

1. In your Supabase project, open **SQL Editor → New query**.
2. Open supabase/migrations/20261012172441_greens_heaven_ticketing.sql. Copy the whole file, paste it into the query, and click **Run**. This is for a fresh project only.
3. After it succeeds, open a second new query. Open supabase/migrations/20261012190000_sequential_reservation_references.sql, copy the whole file, paste it, and click **Run**. New reservations will receive references like GH-001 and will collect a Sri Lankan NIC and year joined; the five-digit school index is optional. Existing reservation references stay unchanged; any older reservations keep the new identity fields empty.
4. In another new query, run `supabase/migrations/20261015214713_update_event_bank_details.sql`. It replaces the original demo details with the Pan Asia Bank account supplied by the organizer.
5. Wait for the success message after each query. If any query shows an error, stop there. Do not click Run again on a partially completed migration. Save the error text and ask for help.

After all three migrations, the account is Pan Asia Bank, Homagama, 2076 1000 2552, K K V N C Kariyawasam. If the website still shows DEMO-NOT-FOR-PAYMENT, the third migration has not been applied to the database used by the app. Verify the details with the organizer before accepting payments.

These three files set up the initial bank payment flow. For the current app, continue with any remaining migrations in filename order. The latest physical cash migration, `20261025095033_online_reservation_cash_payment.sql`, lets organizers record cash against an existing online reservation and send it for review.

## 3. Set the website sign in and email links

Supabase only accepts addresses added to its redirect allow list. Email confirmation and sign-in links use a same-site confirmation page; Google sign-in still returns through its configured callback.

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to your website's base address, without a page path. While using this computer's current preview, enter:

   ~~~text
   http://localhost:5173
   ~~~

   For your deployed website, use its real HTTPS address instead, for example https://greensheavenxxvi.online. Do not type that example unless it is your actual domain.

3. In **Redirect URLs**, add these complete addresses for the current local preview:

   ~~~text
   http://localhost:5173/auth/confirm
   http://localhost:5173/auth/confirm?next=attendee
   http://localhost:5173/auth/confirm?next=admin
   http://localhost:5173/auth/confirm?next=recovery
   http://localhost:5173/auth/confirm?next=account-setup
   http://localhost:5173/auth/callback
   http://localhost:5173/auth/callback?next=admin
   http://localhost:5173/reset-password
   ~~~

   If your development server shows a different address or port, replace http://localhost:5173 with the address it actually shows. Add the same paths using the real HTTPS domain in production. Each one is a complete URL. localhost and 127.0.0.1 count as different addresses; add the one you actually open.

4. Click **Save URL configuration**.

If you later use https://admin.your-real-domain.com as a second address, add that address's three full paths too. Test sign in on the attendee and admin addresses separately.

## 4. Turn on email and password sign in

1. Open **Authentication → Sign In / Providers → Email**. Make sure email sign in is enabled and **Confirm email** is enabled.
2. Set the minimum password length to **6** if the setting is available. The website also asks new users for at least 6 characters.
3. Follow [email setup for greensheavenxxvi.online](email-setup.md) to authenticate the domain in Brevo, connect custom SMTP, and paste the branded Auth templates. It includes exact fields and return URLs.
4. Test confirmation, email sign-in and password reset using your own test account. The local app accepts six-character new passwords; the hosted minimum also needs to be set to six in the Dashboard.

Auth SMTP sends account emails. Reservation approval/rejection emails use the separate function settings in the same email guide.

## 5. Set up Google sign in

There are two places to configure: first Google, then Supabase. The Google callback is your Supabase project URL, not your website URL.

### In Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/). Sign in with the organiser's Google account and choose or create a Google Cloud project.
2. Open **Google Auth Platform → Branding**. Set the app name to Greens Heaven, add an organiser support email, and complete the required contact details. Save.
3. Open **Google Auth Platform → Audience**. Choose **External** so students can use ordinary Google accounts. While the app is in Testing mode, add the Google accounts that will test sign in under **Test users**. Only those listed accounts can test it until you change the publishing status.
4. Open **Google Auth Platform → Data Access**. The basic openid, email, and profile scopes used for sign in are enough. Do not request access to Gmail, Drive, or other Google data.
5. Open **Google Auth Platform → Clients → Create client**. Choose **Web application**.
6. Add your site origin under **Authorized JavaScript origins**. Use just the origin, without a page path. For local testing, use the same host and port you open in the browser:

   ~~~text
   http://localhost:5173
   https://greensheavenxxvi.online
   ~~~

   Add only addresses you really use. Keep local development addresses for testing; use the exact HTTPS address for your live site.

7. Add the **Authorized redirect URI** shown on the Supabase Google provider page (next subsection). It looks like:

   ~~~text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ~~~

   Copy the exact value shown in your Supabase project. It is not https://greensheavenxxvi.online/auth/callback.

8. Click **Create**. Copy the OAuth **Client ID** and **Client Secret** for the next subsection. Treat the Client Secret as private.

### Back in Supabase

9. Open **Authentication → Sign In / Providers → Google**. Enable Google.
10. Copy **Callback URL (for OAuth)** from this page. Go back to Google Cloud and make sure this exact URL is in **Authorized redirect URIs** on the web OAuth client you created.
11. Return to Supabase. Paste the Google OAuth **Client ID** and **Client Secret** into the Google provider fields. Click **Save**.

Google consent screens in Testing mode only work for Google accounts you listed as test users. Add the organiser and any testers there before testing the site's **Continue with Google** button.

## 6. Make the organiser an admin

The dashboard lets an authorised organiser approve payments. Creating a regular account on the website does not make that account an admin.

1. Start the website with npm run dev and open its address.
2. Click **Sign in → Create an account**. Create the organiser's account using their email and a new website password. Do not enter their Gmail password.
3. Open the confirmation email and follow its link. The confirmation page verifies the account before continuing. If Google sign in will be the admin's only sign in method, use Google once instead; a Google-confirmed account is ready without an email link. Do not add an unverified email/password account to the admin list: the database only grants admin access to verified accounts.
4. In the Supabase Dashboard, open **Authentication → Users**. Find the organiser by email and copy their **User UID**.
5. Go to **SQL Editor → New query** and paste this SQL. Replace the sample words inside the quotes with the copied User UID. Keep the single quotes:

   ~~~sql
   insert into private.admins(user_id)
   values ('PASTE-THE-ORGANISER-USER-UID-HERE');
   ~~~

6. Click **Run** and confirm the success message.
7. Open your site's /admin/dashboard, choose **Sign in**, and sign in with that same organiser account. You should see **Reservations**. An attendee's normal account should see **Admin access required**. Attendees use /dashboard for their personal ticket status and /reserve to start a reservation.

If the account is already in private.admins and you run the insert again, the database reports a duplicate row. That is okay; the account is already an admin.

## 7. Test the ticket flow

1. Sign in as an attendee. If you signed in as the organiser for the previous step, use a second email address for this test.
2. Open **Reserve a ticket**. Enter your name, Sri Lankan mobile number (for example 077 123 4567), NIC, and year joined. The five-digit school index is optional. NIC formats accepted are 9 digits followed by V/X or 12 digits; this checks the format only, not that the NIC is genuine. The site prepares the mobile number for WhatsApp automatically. The old/new NIC formats are described by the [Department for Registration of Persons](https://drp.gov.lk/si/faq.php).
3. Click **Continue to payment**. Confirm `/payment` opens automatically with your reservation reference, amount, bank details, and receipt upload. Confirm the displayed bank details match the organizer-provided account. Use a test reservation and sample receipt; this verification does not require a real transfer. If you leave this page, use **Continue to payment** from your dashboard to return.
4. Make a sample receipt file without real account details. Upload and submit it. You should return to `/dashboard` with the status **Receipt under review**. Opening `/payment` again should return you to the dashboard while the receipt is being reviewed.
5. Sign in as the organiser on /admin/dashboard. Open the reservation and inspect the receipt.
6. Test **Reject receipt** first and enter a note such as “Test rejection. Please upload a sample receipt.” Check the attendee page for the note.
7. Choose **Upload corrected receipt** from the attendee dashboard to reopen `/payment`, then submit another harmless sample image. Confirm you return to the dashboard, the earlier receipt remains in history, and the new receipt goes back for review.
8. Test **Approve receipt** from the admin page. Check the attendee's status. If email settings in step 8 are ready, check Brevo's transactional email logs and the attendee's inbox. The dashboard provides a prepared WhatsApp message; the organiser reviews it and sends it manually in WhatsApp.

Before opening real payments, verify the bank update was applied and review the refund policy and entry rules with the organizing team. The refund policy is available at /refund-policy and directs attendees to the Greens Heaven Instagram account. Refunds are arranged manually with the organizers. The SQL to replace the bank fields is in docs/database.md.

## 8. Set up approval and rejection emails

Follow [email setup, steps 7–8](email-setup.md#7-connect-ticket-confirmation-emails). The admin dashboard attempts delivery after a payment review, and shows delivery status separately from approval status. Definite failures can be retried. Approved emails include a QR for organizer verification; rejected emails do not.

If the status says **Delivery needs checking**, inspect Brevo's logs before retrying. The message may already have been delivered. See [email recovery instructions](notifications.md#concurrent-sends-retries-and-recovery).

## When something does not work

- **Redirect URL not allowed:** The full address in the error must match an entry in **Authentication → URL Configuration → Redirect URLs**. Check the protocol (http or https), host (localhost or 127.0.0.1), and port.
- **Google says redirect URI mismatch:** Copy the Supabase **Callback URL** from **Authentication → Sign In / Providers → Google** and paste that exact value into Google Cloud's **Authorized redirect URIs**.
- **Google user is blocked:** The user's Google account needs to be in **Google Auth Platform → Audience → Test users** while the app is in Testing mode.
- **Confirmation email does not arrive:** Check junk mail and the Supabase Auth SMTP settings in step 4. The email function secrets in step 8 do not send confirmation links.
- **Reservation says it cannot load:** Confirm .env uses the same Supabase project where you applied the migration, then restart npm run dev.
- **Admin access required:** Make sure you signed in with the organiser account whose Auth User UID you added in step 6.
- **Build reports a secret key:** Replace VITE_SUPABASE_PUBLISHABLE_KEY with the sb_publishable key shown in the Supabase Dashboard.

More technical detail: [database setup](database.md) and [email setup](notifications.md). The live Google OAuth flow, hosted receipt storage, and SMTP delivery still need to be tested against your own project and domain.

