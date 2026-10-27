import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from './components/ui/button.jsx'
import { Loading, Notice } from './components/Feedback.jsx'
import { supabase } from './utils/supabase.js'
import { friendlyError } from './lib/tickets.js'
import { navigateReservation, reservationRoutes } from './lib/reservationNavigation.js'
import { adminRoutes, navigateAdmin } from './lib/adminNavigation.js'
import ErrorPage, { ErrorShell } from './components/ErrorPage.jsx'
import { registerServiceWorker } from './lib/pwa.js'
import { subscribeToReceiptAlerts } from './lib/adminNotifications.js'

const LandingPage = lazy(() => import('./pages/LandingPage.jsx'))
const AuthLayout = lazy(() => import('./components/AuthLayout.jsx'))
const ReservationLayout = lazy(() => import('./components/ReservationLayout.jsx'))
const ReservationPage = lazy(() => import('./pages/ReservationPage.jsx'))
const RefundPolicyPage = lazy(() => import('./pages/RefundPolicyPage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const AuthPage = lazy(() => import('./pages/AuthPage.jsx'))
const AdminsDrawer = lazy(() => import('./components/admin/AdminsDrawer.jsx'))
const AdminHeader = lazy(() => import('./components/admin/AdminHeader.jsx'))

const currentPath = () => window.location.pathname.replace(/^\/{2,}/, '/').replace(/\/$/, '') || '/'
const appRoutes = new Set(['/', '/refund-policy', '/privacy', '/terms', '/login', '/reset-password', '/auth/callback', '/auth/confirm', ...adminRoutes, ...reservationRoutes])

function LegalPage({ privacy }) {
  return <article className="panel stack narrow"><h1 className="page-heading">{privacy ? 'Your information' : 'Reservations and payments'}</h1>
    {privacy ? <><p>Greens Heaven collects your name, email, Sri Lankan mobile number, NIC number, school index number, school joined year, reservation details, and payment receipt to manage and verify event tickets.</p><p>Authorized organizers can review reservation identity details and use your email or WhatsApp number to contact you about your ticket. Your receipt is stored privately.</p><p>Sign in uses Supabase. If you choose Google, Google also processes your sign in. The site stores a login session in your browser so you can stay signed in.</p><p>For questions about your information or to request its deletion, contact the organizers through the <a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer">Greens Heaven Instagram account</a>.</p><Notice>The organizers still need to publish their data retention period before live registrations open.</Notice></> : <><p>Each account can reserve one ticket for Rs. 7,000. A reservation is confirmed only after the organizers approve the payment receipt.</p><p>Use your reservation reference when making a transfer. Upload a readable receipt and track updates from your personal dashboard.</p><p>Personal cancellations are not refundable. Verified duplicate payments and organizer cancellation of the event are covered by our <a href="/refund-policy">refund policy</a>, subject to applicable consumer rights. Contact the organizers directly to arrange an eligible refund.</p><p>Bank details marked as demo are for testing. Do not make a real transfer using demo details.</p><Notice>Ticket transfer and entry rules have not yet been published. Confirm these with the organizers before making a real payment.</Notice></>}
    <a href="/">Back to the event</a></article>
}

function Callback({ user, error }) {
  const [params] = useState(() => new URLSearchParams(window.location.search))
  useEffect(() => {
    if (user) window.location.replace(params.get('next') === 'admin' ? '/admin/dashboard' : '/dashboard')
  }, [user, params])
  if (user) return <Loading>Taking you to your reservation…</Loading>
  const urlError = params.get('error_description') || params.get('error')
  const resolvedError = error || (urlError ? friendlyError({ message: urlError }) : '')
  return <section className="panel stack narrow"><h1 className="page-heading">Finish signing in</h1><Notice kind="error">{resolvedError || 'This sign-in link could not be completed. It may have expired or already been used. Sign in again or request a fresh link.'}</Notice><a className="button-link" href="/login">Back to sign in</a></section>
}

function AuthConfirm() {
  const [link] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return { tokenHash: params.get('token_hash') || '', type: params.get('type') || '', next: params.get('next') || '' }
  })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [expired, setExpired] = useState(false)
  const valid = Boolean(supabase && link.tokenHash && ['email', 'invite', 'recovery'].includes(link.type))

  async function confirmLink() {
    if (!valid || pending) return
    setPending(true)
    setError('')
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
      if (verifyError) throw verifyError
      if (!data?.session) throw new Error('Verification completed without opening the account.')
      window.history.replaceState(null, '', '/auth/confirm')
      const next = link.type === 'invite'
        ? '/reset-password?claim=1&flow=invite'
        : link.type === 'recovery'
          ? link.next === 'account-setup' ? '/reset-password?claim=1&flow=invite' : '/reset-password?flow=recovery'
          : link.next === 'admin' ? '/admin/dashboard' : '/dashboard'
      window.location.replace(next)
    } catch (verifyError) {
      const expiredLink = ['otp_expired', 'invite_not_found', 'token_expired'].includes(verifyError?.code)
      setExpired(expiredLink)
      setError(expiredLink
        ? link.type === 'invite'
          ? 'This setup link expired or was already used. Ask an organizer to send a new setup email.'
          : link.type === 'recovery'
            ? 'This password reset link expired or was already used. Request a new password reset link.'
            : 'This sign-in link expired or was already used. Return to sign in and request a fresh link.'
        : friendlyError(verifyError))
      setPending(false)
    }
  }

  if (!valid || expired) return <section className="panel stack narrow"><h1 className="page-heading">That link didn’t work</h1><Notice kind="error">{error || 'This sign-in link is incomplete. Return to sign in and request a fresh link.'}</Notice><a className="button-link" href="/login">Back to sign in</a></section>
  return <section className="panel stack narrow"><h1 className="page-heading">{link.type === 'invite' ? 'Set up your ticket account' : link.type === 'recovery' ? 'Reset your password' : 'Finish signing in'}</h1><p>{link.type === 'invite' ? 'Continue to verify your email and choose a password.' : link.type === 'recovery' ? 'Continue to securely verify your email and choose a new password.' : 'Continue to securely verify your email and open your ticket.'}</p><Notice kind="error">{error}</Notice><button className="button-link" type="button" onClick={confirmLink} disabled={pending}>{pending ? 'Verifying…' : error ? 'Try again' : link.type === 'invite' ? 'Continue to password setup' : link.type === 'recovery' ? 'Continue to password reset' : 'Sign in securely'}</button><a href="/login">Back to sign in</a></section>
}

export default function App() {
  const [path, setPath] = useState(currentPath)
  const adminPath = adminRoutes.has(path)
  const notFound = !appRoutes.has(path)
  useEffect(() => {
    const changed = () => setPath(currentPath())
    const clicked = event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target.closest('a[href]')
      if (!link || link.target || link.hasAttribute('download')) return
      const url = new URL(link.href)
      if (url.origin !== location.origin || url.search || url.hash) return
      if (reservationRoutes.has(currentPath()) && reservationRoutes.has(url.pathname)) {
        event.preventDefault()
        navigateReservation(url.pathname)
        return
      }
      if (adminRoutes.has(url.pathname)) {
        event.preventDefault()
        navigateAdmin(url.pathname)
        return
      }
    }
    window.addEventListener('popstate', changed)
    document.addEventListener('click', clicked)
    return () => { window.removeEventListener('popstate', changed); document.removeEventListener('click', clicked) }
  }, [])

  const [auth, setAuth] = useState({ loading: Boolean(supabase), user: null, error: '' })
  const [signingOut, setSigningOut] = useState(false)
  const [adminRefreshing, setAdminRefreshing] = useState(false)
  const [showAdmins, setShowAdmins] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      receivedAuthEvent = true
      setAuth({ loading: false, user: session?.user || null, error: '' })
      if (event === 'PASSWORD_RECOVERY' && !['/reset-password', '/auth/confirm'].includes(currentPath())) window.location.replace('/reset-password')
    })
    const init = supabase.auth.initializePromise || Promise.resolve({ error: null })
    init.then(({ error: initErr }) => {
      if (!active) return
      if (initErr) {
        setAuth({ loading: false, user: null, error: friendlyError(initErr) })
        return
      }
      return supabase.auth.getSession().then(({ data, error }) => {
        if (active && !receivedAuthEvent) setAuth({ loading: false, user: data.session?.user || null, error: error ? friendlyError(error) : '' })
      })
    }).catch(err => { if (active && !receivedAuthEvent) setAuth({ loading: false, user: null, error: friendlyError(err) }) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function signOut() {
    setSigningOut(true); setError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      window.location.assign('/')
    } catch (err) { setError(friendlyError(err)); setSigningOut(false) }
  }

  useEffect(() => {
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (!adminPath || !auth.user || !supabase) return
    const unsubscribe = subscribeToReceiptAlerts()
    return () => unsubscribe()
  }, [adminPath, auth.user])

  function triggerAdminRefresh() {
    setAdminRefreshing(true)
    window.dispatchEvent(new CustomEvent('admin:refresh'))
    setTimeout(() => setAdminRefreshing(false), 650)
  }

  let content
  if (notFound) content = <ErrorPage status={404} />
  else if (path === '/') content = <LandingPage user={auth.user} />
  else if (path === '/refund-policy') content = <RefundPolicyPage />
  else if (path === '/privacy' || path === '/terms') content = <LegalPage privacy={path === '/privacy'} />
  else if (auth.loading) content = <Loading>Checking your sign in…</Loading>
  else if (path === '/login' || path === '/reset-password') content = <Suspense fallback={<Loading>Opening sign in…</Loading>}><AuthPage user={auth.user} recovery={path === '/reset-password'} /></Suspense>
  else if (path === '/auth/callback') content = <Callback user={auth.user} error={auth.error} />
  else if (path === '/auth/confirm' || (path === '/reset-password' && new URLSearchParams(window.location.search).has('token_hash'))) content = <AuthConfirm />
  else if (path === '/reserve' || path === '/ticket') content = <ReservationPage key={auth.user?.id || 'guest'} user={auth.user} />
  else if (path === '/payment') content = <ReservationPage key={auth.user?.id || 'guest'} user={auth.user} view="payment" />
  else if (path === '/dashboard') content = <ReservationPage key={auth.user?.id || 'guest'} user={auth.user} view="dashboard" />
  else if (adminPath) content = <Suspense fallback={<Loading>Opening the admin dashboard…</Loading>}><AdminPage key={auth.user?.id || 'guest'} user={auth.user} currentPath={path} /></Suspense>
  else content = <ErrorPage status={500} />

  if (path === '/') return <div className="app-shell landing-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <Suspense fallback={<Loading>Opening the event…</Loading>}>{content}</Suspense>
  </div>

  if (path === '/login' || path === '/reset-password') return <Suspense fallback={<Loading>Opening sign in…</Loading>}><AuthLayout><Notice kind="error">{auth.error}</Notice>{content}</AuthLayout></Suspense>
  if (reservationRoutes.has(path)) return <Suspense fallback={<Loading>Opening your ticket…</Loading>}><ReservationLayout user={auth.user} dashboard={path === '/dashboard'} onSignOut={signOut} signingOut={signingOut}><Notice kind="error">{error || auth.error}</Notice>{content}</ReservationLayout></Suspense>

  if (notFound) return <ErrorShell user={auth.user} onSignOut={signOut} signingOut={signingOut}>{content}</ErrorShell>

  if (adminPath) return <Suspense fallback={<Loading>Opening the admin dashboard…</Loading>}><div className="app-shell admin-shell p-3">
    <a className="skip-link" href="#main">Skip to content</a>
    <AdminHeader
      user={auth.user}
      onSignOut={signOut}
      signingOut={signingOut}
      adminRefreshing={adminRefreshing}
      onTriggerRefresh={triggerAdminRefresh}
      onOpenAdmins={() => setShowAdmins(true)}
    />
    <main id="main" tabIndex={-1} className="admin-main">
      <Notice kind="error">{error || auth.error}</Notice>
      {content}
    </main>
    <AdminsDrawer
      currentUser={auth.user}
      open={showAdmins}
      onClose={() => setShowAdmins(false)}
    />
  </div></Suspense>

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="container row page-title"><a href="/" className="brand">Greens Heaven</a><nav aria-label="Main navigation" className="row"><a href="/" aria-current={path === '/' ? 'page' : undefined}>The event</a>{auth.user ? <><a href="/dashboard" aria-current={path === '/dashboard' ? 'page' : undefined}>My dashboard</a><Button variant="outline" onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Button></> : <><a href="/reserve" aria-current={path === '/reserve' || path === '/ticket' ? 'page' : undefined}>Reserve a ticket</a><a href="/login" aria-current={path === '/login' ? 'page' : undefined}>Sign in</a></>}</nav></div></header>
    <main id="main" className="container main-content" tabIndex={-1}><Notice kind="error">{error || (path !== '/auth/callback' ? auth.error : '')}</Notice>{content}</main>
    <footer className="site-footer container row page-title"><p className="muted text-sm">Greens Heaven · Isipathana College batch of 2023 O/L & 2026 A/L</p><div className="row"><a href="/privacy">Privacy</a><a href="/terms">Payment information</a><a href="/refund-policy">Refund policy</a><a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer">Instagram</a></div></footer>
  </div>
}
