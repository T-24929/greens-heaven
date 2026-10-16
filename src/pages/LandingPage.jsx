import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { EVENT, formatMoney } from '../lib/tickets.js'
import FadeContent from '../components/FadeContent.jsx'
import StarBorder from '../components/StarBorder.jsx'
import VelocityBanner from '../components/VelocityBanner.jsx'
import BlurText from '../components/BlurText.jsx'
import HeroRipple from '../components/HeroRipple.jsx'
import HeroRays from '../components/HeroRays.jsx'
import BorderGlow from '../components/BorderGlow.jsx'
import useHeroScroll from '../hooks/useHeroScroll.js'
import useSmoothScroll from '../hooks/useSmoothScroll.js'
import './LandingPage.css'

const assets = {
  logo: '/images/greens-heaven-logo.png',
  photo: '/images/hero-grass.png',
  batch: '/images/batch-lockup.png',
  details: '/images/event-details.png',
}

const starButtonProps = {
  as: 'a',
  href: '/reserve',
  color: '#ffffff',
  trailColor: '#ffffff',
  duration: 7,
  direction: 'clockwise',
  stars: 1,
  trailLength: .2,
  thickness: 1,
  radius: 12,
  glow: .35,
  hover: 'brighten',
  sparkle: false,
  clickPulse: true,
  theme: 'dark',
  backgroundColor: 'rgba(34, 41, 35, .85)',
}

// Runs on each fresh landing-page load; failed assets cannot block entry.
function useLandingIntro(brandRef) {
  const [phase, setPhase] = useState(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'ready'
    return 'loading'
  })

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const skip = event => { if (event.matches) setPhase('ready') }
    motion.addEventListener('change', skip)
    return () => motion.removeEventListener('change', skip)
  }, [])

  useLayoutEffect(() => {
    if (phase !== 'loading') return
    const positionLogo = () => {
      const brand = brandRef.current
      const image = brand?.querySelector('img')
      if (!brand || !image) return
      // Measure the untransformed link; the single image is animated inside it.
      const target = brand.getBoundingClientRect()
      const openingWidth = Math.min(300, Math.max(180, window.innerWidth * .22))
      brand.style.setProperty('--intro-x', `${window.innerWidth / 2 - target.left - target.width / 2}px`)
      brand.style.setProperty('--intro-y', `${window.innerHeight / 2 - target.top - target.height / 2}px`)
      brand.style.setProperty('--intro-scale', openingWidth / image.offsetWidth)
    }
    positionLogo()
    const observer = new ResizeObserver(positionLogo)
    if (brandRef.current) observer.observe(brandRef.current)
    window.addEventListener('resize', positionLogo)
    return () => { observer.disconnect(); window.removeEventListener('resize', positionLogo) }
  }, [phase, brandRef])

  useEffect(() => {
    if (phase !== 'loading') return
    let active = true
    let finished = false
    let minimumTimer
    const images = Object.values(assets).map(src => {
      const image = new Image()
      image.src = src
      return image
    })
    function finish() {
      if (!active || finished) return
      finished = true
      setPhase('leaving')
    }
    const fallback = window.setTimeout(finish, 4000)
    const minimum = new Promise(resolve => { minimumTimer = window.setTimeout(resolve, 1600) })
    Promise.all([minimum, ...images.map(image => image.decode().catch(() => {}))]).then(finish)
    return () => { active = false; clearTimeout(fallback); clearTimeout(minimumTimer) }
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timeout = window.setTimeout(() => setPhase('ready'), 1300)
    return () => clearTimeout(timeout)
  }, [phase])

  return phase
}

const questions = [
  ['Who is the evening for?', 'The Isipathana College batch of 2023 O/L and 2026 A/L. Join us at Solis Hotel on 31 October 2026, from 5:30 pm onwards.'],
  ['How do I reserve my ticket?', 'Sign in, fill in your attendee details, and reserve one ticket for Rs. 6,500. The payment page opens next with bank transfer details and a receipt upload.'],
  ['When is my ticket confirmed?', 'The organizers check your payment receipt before confirming your ticket. Follow the status and any updates from your personal dashboard.'],
  ['What if my receipt needs attention?', 'Your dashboard will show the organizer’s note. Choose “Upload corrected receipt” to return to the payment page.'],
  ['Can I get a refund?', <>Personal cancellations are not refundable. Verified duplicate payments and organizer cancellation are covered, subject to applicable consumer rights. See the <a href="/refund-policy">refund policy</a> and contact the organizers directly.</>],
]

export default function LandingPage({ user }) {
  const brandRef = useRef(null)
  const phase = useLandingIntro(brandRef)
  const [imageSettled, setImageSettled] = useState(false)
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = setTimeout(() => setImageSettled(true), 1200)
    return () => clearTimeout(timer)
  }, [phase])
  const heroRef = useRef(null)
  useHeroScroll(heroRef, phase === 'ready')
  useSmoothScroll()
  return <>
    {phase !== 'ready' && <div className="landing-intro" data-phase={phase} aria-hidden="true" />}

    <main id="main" className="landing-main" data-intro-phase={phase} tabIndex={-1}>
      <div className="landing-hero-stage">
      <section ref={heroRef} className="landing-hero" aria-labelledby="landing-title">
        <img className="landing-photo" src={assets.photo} width="1080" height="1350" alt="" fetchPriority="high" />
        <HeroRipple src={assets.photo} enabled={phase === 'ready' && imageSettled} />
        <HeroRays enabled={phase === 'ready' && imageSettled} />
        <div className="landing-shade" aria-hidden="true" />

        <header className="landing-header">
          <a ref={brandRef} className="landing-brand" href="/" aria-label="Greens Heaven home" aria-current="page">
            <img src={assets.logo} width="425" height="179" alt="Greens Heaven" />
          </a>
          <nav aria-label="Main navigation">
            <StarBorder {...starButtonProps} className="landing-nav-reserve"><BlurText text="Reserve a ticket" enabled={phase === 'ready'} startDelay={400} /></StarBorder>
            <a href={user ? '/dashboard' : '/login'}><BlurText text={user ? 'My dashboard' : 'Sign in'} enabled={phase === 'ready'} startDelay={450} /></a>
          </nav>
        </header>

        <div className="landing-copy">
          <img className="landing-batch" src={assets.batch} width="274" height="41" alt="Isipathana College · Batch of 2023 O/L & 2026 A/L" />
          <h1 id="landing-title"><em><BlurText text="One evening." enabled={phase === 'ready'} delay={90} startDelay={250} /></em><br /><BlurText text="The whole" enabled={phase === 'ready'} delay={90} startDelay={400} /><br /><BlurText text="batch." enabled={phase === 'ready'} startDelay={550} /></h1>
          <p><BlurText text="See you at Solis on 31 October." enabled={phase === 'ready'} delay={35} startDelay={650} /></p>
          <FadeContent className="landing-reserve" trigger="mount" enabled={phase === 'ready'} duration={.7} delay={.65}>
            <StarBorder {...starButtonProps} className="landing-cta"><BlurText text="Reserve a Ticket" enabled={phase === 'ready'} startDelay={700} /></StarBorder>
            <span><BlurText text={`${formatMoney(EVENT.ticket_price_lkr)} per ticket`} enabled={phase === 'ready'} startDelay={750} /></span>
          </FadeContent>
        </div>

        <div className="landing-side-links">
          <a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer" aria-label="Greens Heaven on Instagram" title="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".75" fill="currentColor" stroke="none" /></svg></a>
          <a href="#how-it-works" aria-label="How to reserve your ticket" title="How to reserve"><ArrowDown size={20} strokeWidth={1.5} /></a>
        </div>

        <FadeContent className="landing-event-details" trigger="mount" enabled={phase === 'ready'} duration={.8} delay={.8}>
          <img src={assets.details} width="706" height="167" alt="31 October 2026 · Solis Hotel · 5:30 pm onwards" />
        </FadeContent>
      </section>
      </div>

      <section id="how-it-works" className="landing-how" aria-labelledby="how-title">
        <FadeContent className="landing-section-heading" duration={.75} stagger={.08}>
          <p className="landing-kicker"><BlurText text="FROM RESERVATION TO REUNION" /></p>
          <h2 id="how-title"><BlurText text="Your ticket." delay={70} /><br /><em><BlurText text="Three simple steps." delay={70} startDelay={150} /></em></h2>
          <p><BlurText text="Reserve your place, make the transfer, and follow your ticket from your own dashboard." delay={25} /></p>
        </FadeContent>
        <FadeContent className="landing-step-grid" duration={.75} stagger={.12} threshold={.08}>
          <BorderGlow as="article" className="landing-step">
            <span className="landing-step-number" aria-hidden="true">01</span>
            <p className="landing-step-label"><BlurText text="YOUR DETAILS" /></p>
            <h3><BlurText text="Make it official." delay={65} /></h3>
            <p><BlurText text="Sign in and enter your attendee details to reserve one ticket. Your school index number is optional." delay={20} /></p>
            <a href="/reserve"><BlurText text="Reserve your ticket" /> <span aria-hidden="true">↗</span></a>
          </BorderGlow>
          <BorderGlow as="article" className="landing-step">
            <span className="landing-step-number" aria-hidden="true">02</span>
            <p className="landing-step-label"><BlurText text="BANK TRANSFER" /></p>
            <h3><BlurText text="Pay. Upload. Done." delay={65} /></h3>
            <p><BlurText text="The payment page opens next. Transfer Rs. 6,500 using the bank details, then upload a clear JPG, PNG, or PDF receipt for review." delay={20} /></p>
            <a href="/payment"><BlurText text="Go to payment" /> <span aria-hidden="true">↗</span></a>
          </BorderGlow>
          <BorderGlow as="article" className="landing-step">
            <span className="landing-step-number" aria-hidden="true">03</span>
            <p className="landing-step-label"><BlurText text="YOUR DASHBOARD" /></p>
            <h3><BlurText text="Keep your ticket close." delay={65} /></h3>
            <p><BlurText text="See your reservation reference and payment status in one place. Your ticket is confirmed after the organizers approve your receipt." delay={20} /></p>
            <a href="/dashboard"><BlurText text="Open your dashboard" /> <span aria-hidden="true">↗</span></a>
          </BorderGlow>
        </FadeContent>
        <FadeContent className="landing-ticket-note" duration={.6}>
          <div><span className="landing-kicker"><BlurText text="ONE TICKET · ONE ACCOUNT" /></span><p><BlurText text={formatMoney(EVENT.ticket_price_lkr)} /> <span><BlurText text="per person" /></span></p></div>
          <p><BlurText text="31 October 2026" /><br /><BlurText text="Solis Hotel · 5:30 pm onwards" /></p>
          <StarBorder {...starButtonProps} className="landing-cta"><BlurText text="Reserve a Ticket" /></StarBorder>
        </FadeContent>
      </section>

      <VelocityBanner />

      <section id="event-info" className="landing-info" aria-labelledby="info-title">
        <FadeContent className="landing-info-heading" duration={.65} stagger={.06}>
          <p className="landing-kicker"><BlurText text="BEFORE THE EVENING" /></p>
          <h2 id="info-title"><BlurText text="A few things" delay={70} /><br /><BlurText text="to know." delay={70} startDelay={150} /></h2>
          <a href={user ? '/dashboard' : '/login?next=dashboard'}><BlurText text="Track your reservation" /> <span aria-hidden="true">↗</span></a>
        </FadeContent>
        <FadeContent className="landing-questions" duration={.65} stagger={.06}>{questions.map(([question, answer]) => <details key={question}>
          <summary><BlurText text={question} /><span aria-hidden="true" className="landing-plus" /></summary>
          <p>{typeof answer === 'string' ? <BlurText text={answer} delay={20} /> : answer}</p>
        </details>)}</FadeContent>
      </section>
    </main>

    <footer className="landing-footer">
      <div className="landing-footer-top">
      <img src={assets.batch} width="274" height="41" alt="Isipathana College · Batch of 2023 O/L & 2026 A/L" />
      <nav aria-label="Footer navigation">
        <a href="/privacy"><BlurText text="Privacy" /></a><a href="/terms"><BlurText text="Payment information" /></a><a href="/refund-policy"><BlurText text="Refund policy" /></a>
        <a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer"><BlurText text="Instagram" /> <span aria-hidden="true">↗</span></a>
      </nav>
      </div>
      <div className="landing-footer-wordmark opacity-25" aria-hidden="true">
        <img src={assets.logo} width="425" height="179" alt="" loading="lazy" />
      </div>
    </footer>
  </>
}
