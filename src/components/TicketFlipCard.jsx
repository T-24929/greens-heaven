import { Loader } from './motion/loader.jsx'
import { useEffect, useRef, useState } from 'react'
import { Rotate3D, Download, Utensils, Disc3, Martini, Camera, ShieldCheck } from 'lucide-react'

// Lightweight adaptation of the supplied React Bits FlipCard interaction:
// two 3D faces, horizontal swipe, and a separate native keyboard/touch button.
// No continuous hover tilt, so the QR stays still and easy to scan.
function TicketQr({ reservation }) {
  const [image, setImage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const url = new URL('/admin/dashboard', window.location.origin)
    url.searchParams.set('ticket', reservation.id)
    url.searchParams.set('reference', reservation.reference)
    import('qrcode').then(module => (module.default || module).toDataURL(url.href, {
      width: 480, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
    })).then(data => { if (active) setImage(data) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [reservation.id, reservation.reference])
  return <div className="dash-qr-content">
    <header className="dash-qr-header"><div className="dash-ticket-top"><span>ISIPATHANA COLLEGE</span><span>XXVI</span></div><img src="/images/greens-heaven-logo.png" alt="Greens Heaven" width="425" height="179" /><p className="dash-eyebrow">YOUR CONFIRMED TICKET</p><h2>Your evening awaits.</h2></header>
    <div className="dash-qr-main">
    <div className="dash-qr-image">{image ? <img src={image} width="240" height="240" alt={`Organizer verification QR for ticket ${reservation.reference}`} /> : <p role="status">{failed ? 'QR unavailable. Use your ticket email or ask an organizer to look up your reference.'  : <Loader size={24} label="Preparing your QR" />}</p>}</div>
    <strong className="dash-qr-reference">{reservation.reference}</strong><p>31 October 2026 · 5:30 pm onwards<br />Solis Hotel · One person</p><p className="dash-qr-help">Show this QR to the organizers at the entrance.</p>
    {image && <a className="dash-calendar" href={image} download={`${reservation.reference}-QR.png`}><Download size={16} />Save QR image</a>}
    </div>
    <section className="dash-qr-benefits"><p className="dash-eyebrow">INCLUDED WITH YOUR TICKET</p><ul><li><Utensils size={16} /><span>Unlimited gourmet buffet</span></li><li><Disc3 size={16} /><span>DJ</span></li><li><Martini size={16} /><span>Unlimited beverages</span></li><li><Camera size={16} /><span>Photo booths</span></li></ul></section>
    <div className="dash-ticket-caption"><ShieldCheck size={15} /><span>Confirmed · Keep your ticket QR private.</span></div>
  </div>
}

export default function TicketFlipCard({ reservation, children, actions }) {
  const [flipped, setFlipped] = useState(false)
  const drag = useRef(null)
  const approved = reservation.status === 'approved'
  const back = approved && flipped
  function start(event) {
    if (!approved || event.button !== 0 || event.target.closest('a,button,summary')) return
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  function end(event) {
    const initial = drag.current
    drag.current = null
    if (!initial || initial.id !== event.pointerId) return
    const dx = event.clientX - initial.x, dy = event.clientY - initial.y
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setFlipped(value => !value)
    }
  }
  if (!approved) return <div>{children}<div className="dash-ticket-actions">{actions}</div></div>
  return <div className="dash-flip">
    <div className="dash-flip-stage" onPointerDown={start} onPointerUp={end} onPointerCancel={() => { drag.current = null }}>
      <div className="dash-flip-inner" data-flipped={back}>
        <div className="dash-flip-face dash-flip-front" aria-hidden={back} inert={back}>{children}</div>
        <div className="dash-flip-face dash-flip-back" aria-hidden={!back} inert={!back}><TicketQr key={reservation.id} reservation={reservation} /></div>
      </div>
    </div>
    <div className="dash-flip-controls"><span>Swipe to turn your ticket</span><div className="dash-ticket-actions">{actions}<button type="button" className="dash-refresh" aria-pressed={back} onClick={() => setFlipped(value => !value)}><Rotate3D size={17} aria-hidden="true" />{back ? 'Show ticket front' : 'Show ticket QR'}</button></div></div>
  </div>
}
