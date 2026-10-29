import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import {
  ArrowUpRight,
  Camera,
  Check,
  HeartHandshake,
  PartyPopper,
  Sparkles,
} from 'lucide-react'
import '../pages/Dashboard.css'

export default function LiveAttendancePass({
  hasEntranceOnly,
  hasBothGates,
  isPartyEnded,
  attendance,
  reservation,
}) {
  const cardRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !cardRef.current) return
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isReduced) return

    const ctx = gsap.context(() => {
      // 1. Weightless float-in entrance for the live attendance ticket
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 16, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }
      )

      // 2. Staggered reveal for internal ticket elements
      const elements = cardRef.current.querySelectorAll('.dash-ticket-live-stagger')
      if (elements.length) {
        gsap.fromTo(
          elements,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out', delay: 0.1 }
        )
      }

      // 3. Ambient breathing glow
      const glow = cardRef.current.querySelector('.dash-ticket-live-glow')
      if (glow) {
        gsap.to(glow, {
          scale: 1.15,
          opacity: 0.85,
          duration: 3.2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }
    }, cardRef)

    return () => ctx.revert()
  }, [hasEntranceOnly, hasBothGates, isPartyEnded])

  const entranceTime = attendance?.entrance_at
    ? new Date(attendance.entrance_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Colombo',
      })
    : null

  const reference = reservation?.reference || 'GH-2026'

  // Variant A: Post 9:00 PM - Event Concluded Commemorative Pass
  if (isPartyEnded) {
    return (
      <article ref={cardRef} className="dash-ticket dash-ticket-live-card is-ended" aria-label="Event Concluded Live Attendance Pass">
        <div className="dash-ticket-live-glow" aria-hidden="true" />
        <div className="dash-ticket-frost" aria-hidden="true"><i /><i /></div>
        <div className="dash-ticket-live-body">
          <div className="dash-ticket-live-top dash-ticket-live-stagger">
            <span className="dash-ticket-live-pass is-ended">
              <PartyPopper size={13} aria-hidden="true" />
              <span>EVENT CONCLUDED</span>
            </span>
            <span className="dash-ticket-live-badge">31 OCT 2026</span>
          </div>
          <h2 className="dash-ticket-live-stagger">Thank you for being part of Greens Heaven XXVI.</h2>
          <p className="dash-ticket-live-stagger">
            The party at Solis has wrapped up, but the memories stay. Thank you for joining us tonight and celebrating with the batch. Catching up with everyone made this reunion special.
          </p>
        </div>

        <div className="dash-ticket-live-stub">
          <div className="dash-attendance-check-list">
            <div className="dash-attendance-item is-done dash-ticket-live-stagger">
              <span className="dash-check-dot" aria-label="Batch photos">
                <Camera size={15} />
              </span>
              <div className="dash-attendance-info">
                <div className="dash-attendance-title-row">
                  <strong>Batch photo gallery</strong>
                  <span className="dash-attendance-tag is-done">Coming soon</span>
                </div>
                <span>Portraits being processed</span>
              </div>
            </div>
            <div className="dash-attendance-item is-done dash-ticket-live-stagger">
              <span className="dash-check-dot" aria-label="Attendance verified">
                <Check size={16} strokeWidth={2.5} />
              </span>
              <div className="dash-attendance-info">
                <div className="dash-attendance-title-row">
                  <strong>Attendance logged</strong>
                  <span className="dash-attendance-tag is-done">Solis Hotel</span>
                </div>
                <span>Batch reunion attended</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dash-ticket-live-action dash-ticket-live-stagger">
          <a
            href="https://www.instagram.com/greens_heaven/"
            target="_blank"
            rel="noreferrer"
            className="dash-primary"
          >
            <span>Follow photo drops on Instagram</span>
            <ArrowUpRight size={16} />
          </a>
        </div>

        <div className="dash-ticket-live-caption dash-ticket-live-stagger">
          <Sparkles size={14} aria-hidden="true" />
          <span>2023 O/L &amp; 2026 A/L batch · Isipathana College</span>
        </div>
      </article>
    )
  }

  // Variant B: Both Gates Verified - Party Mode Pass
  if (hasBothGates) {
    return (
      <article ref={cardRef} className="dash-ticket dash-ticket-live-card is-party" aria-label="All Gates Verified Party Pass">
        <div className="dash-ticket-live-glow" aria-hidden="true" />
        <div className="dash-ticket-frost" aria-hidden="true"><i /><i /></div>
        <div className="dash-ticket-live-body">
          <div className="dash-ticket-live-top dash-ticket-live-stagger">
            <span className="dash-ticket-live-pass is-party">
              <Sparkles size={13} aria-hidden="true" />
              <span>ALL GATES VERIFIED</span>
            </span>
            <span className="dash-ticket-live-badge">FULL ATTENDANCE</span>
          </div>
          <h2 className="dash-ticket-live-stagger">You’re all set. Enjoy the party!</h2>
          <p className="dash-ticket-live-stagger">
            Both your entrance and photo booth sessions are recorded. Grab a drink, catch up with old friends, and make the most of tonight.
          </p>
        </div>

        <div className="dash-ticket-live-stub">
          <div className="dash-attendance-check-list">
            <div className="dash-attendance-item is-done dash-ticket-live-stagger">
              <span className="dash-check-dot" aria-label="Entrance gate checked in">
                <Check size={16} strokeWidth={2.5} />
              </span>
              <div className="dash-attendance-info">
                <div className="dash-attendance-title-row">
                  <strong>Entrance gate</strong>
                  <span className="dash-attendance-tag is-done">Admitted</span>
                </div>
                <span>{entranceTime ? `Checked in at ${entranceTime}` : 'Identity verified & admitted'}</span>
              </div>
            </div>
            <div className="dash-attendance-item is-done dash-ticket-live-stagger">
              <span className="dash-check-dot" aria-label="Photo booth checked in">
                <Check size={16} strokeWidth={2.5} />
              </span>
              <div className="dash-attendance-info">
                <div className="dash-attendance-title-row">
                  <strong>Photo Booth</strong>
                  <span className="dash-attendance-tag is-done">Recorded</span>
                </div>
                <span>Portraits captured</span>
              </div>
            </div>
          </div>
        </div>

        <div className="dash-ticket-live-caption dash-ticket-live-stagger">
          <HeartHandshake size={14} aria-hidden="true" />
          <span>Thank you for celebrating with us tonight. A thank-you email has been sent.</span>
        </div>
      </article>
    )
  }

  // Variant C: Entrance Verified, Photo Booth Pending
  return (
    <article ref={cardRef} className="dash-ticket dash-ticket-live-card" aria-label="Gate 1 Verified Live Pass">
      <div className="dash-ticket-live-glow" aria-hidden="true" />
      <div className="dash-ticket-frost" aria-hidden="true"><i /><i /></div>
      <div className="dash-ticket-live-body">
        <div className="dash-ticket-live-top dash-ticket-live-stagger">
          <span className="dash-ticket-live-pass">
            <Camera size={13} aria-hidden="true" />
            <span>NEXT: PHOTO BOOTH</span>
          </span>
          <span className="dash-ticket-live-badge">GATE 01 VERIFIED</span>
        </div>
        <h2 className="dash-ticket-live-stagger">You’re inside! Don’t forget the photo booth.</h2>
        <p className="dash-ticket-live-stagger">
          Welcome to Greens Heaven XXVI. Before the floor fills up, head over to the Photo Booth area with your batchmates to capture your official portraits.
        </p>
      </div>

      <div className="dash-ticket-live-stub">
        <div className="dash-attendance-check-list">
          <div className="dash-attendance-item is-done dash-ticket-live-stagger">
            <span className="dash-check-dot" aria-label="Entrance gate checked in">
              <Check size={16} strokeWidth={2.5} />
            </span>
            <div className="dash-attendance-info">
              <div className="dash-attendance-title-row">
                <strong>Entrance gate</strong>
                <span className="dash-attendance-tag is-done">Admitted</span>
              </div>
              <span>{entranceTime ? `Checked in at ${entranceTime}` : 'Identity verified & admitted'}</span>
            </div>
          </div>
          <div className="dash-attendance-item is-pending dash-ticket-live-stagger">
            <span className="dash-check-dot" aria-label="Photo Booth next step">
              <Camera size={15} />
            </span>
            <div className="dash-attendance-info">
              <div className="dash-attendance-title-row">
                <strong>Photo Booth</strong>
                <span className="dash-attendance-tag is-next">Up next</span>
              </div>
              <span>Portraits waiting for you</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-ticket-live-caption dash-ticket-live-stagger">
        <Camera size={14} aria-hidden="true" />
        <span>Show reference {reference} at the Photo Booth desk.</span>
      </div>
    </article>
  )
}
