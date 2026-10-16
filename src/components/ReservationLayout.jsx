import { LayoutGroup } from 'motion/react'
import { ArrowLeft } from 'lucide-react'

import '../pages/ReservationPage.css'



export default function ReservationLayout({ children, user, dashboard = false, onSignOut, signingOut }) {

  return <div className="app-shell reservation-shell">

    <a className="skip-link" href="#main">Skip to content</a>

    <header className="reservation-header"><a href="/" aria-label="Greens Heaven home" className="reservation-brand"><img src="/images/greens-heaven-logo.png" width="425" height="179" alt="Greens Heaven" /></a><nav aria-label="Main navigation"><a href="/" className="reservation-back"><ArrowLeft size={16} aria-hidden="true" />The event</a>{user && (dashboard ? <button className="dashboard-signout" onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button> : <a href="/dashboard">My dashboard</a>)}</nav></header>

    <main id="main" className="reservation-main" tabIndex={-1}><LayoutGroup id="reservation-flow">{children}</LayoutGroup></main>

    <footer className="reservation-footer"><span>GREENS HEAVEN · XXVI</span><nav aria-label="Reservation information"><a href="/privacy">Privacy</a><a href="/refund-policy">Refund policy</a></nav></footer>

  </div>

}

