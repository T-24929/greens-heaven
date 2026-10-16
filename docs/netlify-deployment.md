# GitHub → Netlify

The repository is configured for a static Vite deployment. GitHub and Netlify connection are left to you; no push or deployment was performed.

## Connect the repository

1. Push the project to your GitHub repository, `T-24929/greens-heaven`.
2. In Netlify, choose **Add new project → Import an existing project → GitHub**, then select that repository and the `main` branch.
3. Leave the base directory empty (repository root). The committed `netlify.toml` sets:
   - Build command: `npm run check && npm run build`
   - Publish directory: `dist`
   - Node: 22 (Vite needs at least 22.12 in this major)
4. Before deploying, add these environment variables with **build** scope:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your project's HTTPS URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Its public publishable key, or legacy anon key |

5. Deploy. The build runs lint, application/email tests and database authorization tests before creating the site. The database tests use a disposable local database; they do not change your Supabase project.

These two values are public browser configuration. Do not add SMTP passwords, Supabase service-role keys or other secrets under `VITE_`. The production build rejects missing configuration, privileged Supabase keys and unexpected `VITE_` variables. Use a separate test Supabase project for deploy previews if you enable them; never automatically allow arbitrary preview origins into production Auth.

Netlify installs the lockfile's dependencies. The configuration includes dev dependencies because Vite, ESLint and the test tools are needed during the build. There is no Netlify server/function to deploy: backend logic remains in Supabase.

## Routes and security headers

`public/_redirects` supplies the non-forced SPA rewrite to `/index.html`, and Vite copies it to `dist/_redirects`. Existing assets are served normally. Direct visits and refreshes work for `/login`, `/reserve`, `/payment`, `/dashboard`, `/admin/dashboard`, `/auth/callback` and `/reset-password`.

`public/_headers` supplies CSP, frame blocking, MIME sniffing protection, referrer restrictions and HTTPS persistence. Fingerprinted `/assets/` files can be cached for a year. Do not add a second SPA rewrite in the Netlify UI or TOML. Netlify handles HTTPS redirects; configure the primary domain in its domain settings.

The CSP permits this site's scripts and Supabase connections. Inline styles are allowed for the existing React animation effects; inline scripts are not. If you add external analytics, fonts or a custom Supabase API domain, update only the required CSP directives. A protected route still depends on Supabase authorization and RLS; routing rules cannot grant admin access.

## Connect greensheavenxxvi.online

1. In Netlify **Domain management**, add `greensheavenxxvi.online` and make it the primary domain. Add `www` if you plan to use it.
2. Keep DNS at Namecheap if it is already authoritative. Copy the exact A/ALIAS/CNAME values Netlify shows into Namecheap **Advanced DNS**; do not guess the deployment hostname or an IP address.
3. Preserve the Brevo authentication and mail forwarding records. Wait for DNS verification and Netlify's HTTPS certificate.
4. In Supabase, set the Auth Site URL to `https://greensheavenxxvi.online` and add these exact redirect URLs:

   ```text
   https://greensheavenxxvi.online/auth/callback
   https://greensheavenxxvi.online/auth/callback?next=admin
   https://greensheavenxxvi.online/reset-password
   ```

5. Set the email function's `SITE_URL` and `ALLOWED_ORIGINS` to the actual production origin, and deploy that function separately. Follow [email setup](email-setup.md).

## What stays out of Git

`.gitignore` excludes `.env` files (except `.env.example`), dependencies, generated builds, Netlify/Vercel local state, installed skills, AI agent directories/instructions, MCP config, test artifacts and private key files. These local files are not deleted. Already-tracked files are unaffected by ignore rules; check `git status` and the staged file list before publishing. The existing repository had only `README.md` tracked when these rules were added.

## Before accepting real reservations

Apply the pending Supabase migrations, verify the Pan Asia bank account shown on `/payment`, configure SMTP, and confirm the organizer's admin role. Set the hosted Auth password minimum to six. These external settings are not changed by Netlify.

After deploying, test a confirmation link, reset link, reservation, receipt review and ticket email. Refresh each app route directly, and confirm an ordinary attendee cannot read another attendee's reservation or access admin data. The site keeps its existing `noindex` while setup is unfinished; remove it deliberately when ready for search engines. Publish the outstanding entry and data-retention details with the organizers.

References: [Vite on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/), [SPA rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/), [build configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/).
