import { ArrowLeft } from 'lucide-react'
import '../pages/AuthPage.css'

export default function AuthLayout({ children }) {
  return <div className="app-shell auth-shell">
    <a className="skip-link" href="#main">Skip to sign in</a>
    <header className="auth-header">
      <a href="/" className="auth-brand" aria-label="Greens Heaven home"><img src="/images/greens-heaven-logo.png" width="425" height="179" alt="Greens Heaven" /></a>
      <a href="/" className="auth-back"><ArrowLeft size={16} aria-hidden="true" /> Back to the event</a>
    </header>
    <main id="main" className="auth-main" tabIndex={-1}>
      <aside className="auth-scene" aria-label="Greens Heaven event">
        <img className="auth-scene-photo" src="/images/hero-grass.png" width="1080" height="1350" alt="" />
        <div className="auth-scene-shade" />
        <div className="auth-scene-top"><span>ISIPATHANA COLLEGE</span><span>XXVI</span></div>
        <div className="auth-scene-copy">
          <img src="/images/batch-lockup.png" width="274" height="41" alt="Batch of 2023 O/L & 2026 A/L" />
          <h2><em>One evening.</em><br />The whole batch.</h2>
          <p>A familiar crowd. A night to remember.</p>
          <div className="auth-event-line"><span>31 OCTOBER 2026</span><span>SOLIS HOTEL · 5:30 PM</span></div>
        </div>
      </aside>
      <div className="auth-form-side">
        <div className="auth-form-content">{children}</div>
        <footer className="auth-footer"><span>GREENS HEAVEN · XXVI</span><nav aria-label="Account information"><a href="/privacy">Privacy</a><a href="/terms">Payment information</a></nav></footer>
      </div>
    </main>
  </div>
}
