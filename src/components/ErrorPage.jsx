import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react'
import BlurText from './BlurText.jsx'
import HeroRipple from './HeroRipple.jsx'
import HeroRays from './HeroRays.jsx'

import './ErrorPage.css'

const statusCopy = {
  401: {
    eyebrow: 'Sign in required',
    title: 'Sign in at the door.',
    description: 'Use an organizer account to continue into the event workspace.',
    note: 'Your attendee account and reservation remain unchanged.',
    primary: { label: 'Sign in as organizer', href: '/login?next=admin' },
    secondary: { label: 'Back to the event', href: '/' },
  },
  403: {
    eyebrow: 'Organizer access only',
    title: 'This door is for organizers.',
    description: 'This account cannot review reservations or manage entry for the event.',
    note: 'Your attendee account and reservation remain unchanged.',
    primary: { label: 'Back to the event', href: '/' },
    secondary: { label: 'Open my dashboard', href: '/dashboard' },
  },
  404: {
    eyebrow: 'Page not found',
    title: 'This path ends here.',
    description: 'The page may have moved, but the evening is still waiting. Head back to the event or open your ticket dashboard.',
    note: 'Nothing on your reservation was changed.',
    primary: { label: 'Return to the event', href: '/' },
    secondary: { label: 'Open my ticket', href: '/dashboard' },
  },
  500: {
    eyebrow: 'Unexpected error',
    title: 'Something went off script.',
    description: 'The page could not finish what it was doing. Refresh once, then return to the event if the problem continues.',
    note: 'Your saved reservation details are not affected.',
    primary: { label: 'Try this page again', reload: true },
    secondary: { label: 'Back to the event', href: '/' },
  },
  503: {
    eyebrow: 'Temporarily unavailable',
    title: 'We are setting the room back up.',
    description: 'This part of Greens Heaven is briefly unavailable. Try again in a moment or return to the event.',
    note: 'Your saved reservation details are not affected.',
    primary: { label: 'Try again', reload: true },
    secondary: { label: 'Back to the event', href: '/' },
  },
}

const fallbackCopy = {
  eyebrow: 'Page unavailable',
  title: 'This page needs a moment.',
  description: 'Return to Greens Heaven and choose where you would like to go next.',
  note: 'Nothing on your reservation was changed.',
  primary: { label: 'Back to the event', href: '/' },
  secondary: { label: 'Open my ticket', href: '/dashboard' },
}

export function ErrorShell({ children, user, onSignOut, signingOut = false }) {
  return <div className="app-shell error-route-shell">
    <a className="skip-link" href="#main">Skip to recovery options</a>
    <header className="error-shell-header">
      <a className="error-shell-brand" href="/" aria-label="Greens Heaven home"><img src="/images/greens-heaven-logo.png" width="425" height="179" alt="Greens Heaven" /></a>
      <nav className="error-shell-nav" aria-label="Error page navigation">
        <a href="/reserve">Reserve a ticket</a>
        {user ? <><a href="/dashboard">My dashboard</a><button type="button" onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></> : <a href="/login">Sign in</a>}
      </nav>
    </header>
    <main id="main" className="error-shell-main" tabIndex={-1}>{children}</main>
    <footer className="error-shell-footer">
      <div className="error-shell-lockup"><img src="/images/batch-lockup.png" width="274" height="41" alt="Batch of 2023 O/L and 2026 A/L" /><span>31 October 2026 · Solis Hotel</span></div>
      <nav aria-label="Error page information"><a href="/privacy">Privacy</a><a href="/terms">Payment information</a><a href="/refund-policy">Refund policy</a><a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer">Instagram</a></nav>
    </footer>
  </div>
}

function ErrorAction({ action, primary = false }) {
  if (!action) return null
  const back = !primary && action.href === '/'
  const className = `${primary ? 'error-primary' : 'error-secondary'} ${back ? 'error-action-back' : 'error-action-forward'}`
  const icon = action.reload ? <RotateCcw size={18} aria-hidden="true" /> : back ? <ArrowLeft size={16} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />
  if (action.reload || action.onClick) return <button type="button" className={className} onClick={action.onClick || (() => window.location.reload())}>{action.label}{icon}</button>
  return <a className={className} href={action.href}>{primary ? <>{action.label}{icon}</> : <>{icon}{action.label}</>}</a>
}

export default function ErrorPage({ status = 404, title, description, note, eyebrow, primaryAction, secondaryAction }) {
  const [imageReady, setImageReady] = useState(false)
  const preset = statusCopy[status] || fallbackCopy
  const primary = primaryAction === undefined ? preset.primary : primaryAction
  const secondary = secondaryAction === undefined ? preset.secondary : secondaryAction

  useEffect(() => {
    const previousTitle = document.title
    const existingRobots = document.querySelector('meta[name="robots"]')
    const previousRobots = existingRobots?.getAttribute('content')
    const robots = existingRobots || document.head.appendChild(document.createElement('meta'))
    if (!existingRobots) robots.setAttribute('name', 'robots')
    robots.setAttribute('content', 'noindex, nofollow')
    document.title = `${status} · Greens Heaven`
    return () => {
      document.title = previousTitle
      if (existingRobots) {
        if (previousRobots === null) existingRobots.removeAttribute('content')
        else existingRobots.setAttribute('content', previousRobots)
      } else robots.remove()
    }
  }, [status])

  return <section className="error-page" aria-labelledby="error-title">
    <div className="error-scene" aria-hidden="true">
      <img className="error-scene-photo" src="/images/hero-grass.png" width="1080" height="1350" alt="" onLoad={() => setImageReady(true)} />
      <HeroRipple src="/images/hero-grass.png" enabled={imageReady} />
      <HeroRays enabled={imageReady} />
      <span className="error-code">{status}</span>
      <span className="error-scene-label">Greens Heaven · XXVI</span>
      <img className="error-event-details" src="/images/event-details.png" width="706" height="167" alt="" />
    </div>
    <div className="error-content">
      <img className="error-logo" src="/images/greens-heaven-logo.png" width="425" height="179" alt="Greens Heaven" />
      <img className="error-batch" src="/images/batch-lockup.png" width="274" height="41" alt="Batch of 2023 O/L and 2026 A/L" />
      <p className="error-eyebrow"><BlurText text={`${status} · ${eyebrow || preset.eyebrow}`} startDelay={80} /></p>
      <span className="error-status"><BlurText text={String(status)} startDelay={80} delay={0} /></span>
      <h1 id="error-title"><BlurText text={title || preset.title} startDelay={160} delay={55} /></h1>
      <p className="error-description"><BlurText text={description || preset.description} startDelay={240} delay={24} /></p>
      <div className="error-actions">
        <ErrorAction action={primary} primary />
        <ErrorAction action={secondary} />
      </div>
      <p className="error-note"><ShieldCheck size={16} aria-hidden="true" />{note || preset.note}</p>
    </div>
  </section>
}
