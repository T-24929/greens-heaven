import { useState } from 'react'
import { RotateCcw, MoveRight } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { formatMoney } from '../lib/tickets.js'
const DragTicket = lazy(() => import('./ReactBitsTearTicket.jsx'))

// A reusable visual preview. Tearing is local presentation state only.
export default function TearTicket({ amount = 7000 }) {
  const [torn, setTorn] = useState(false)
  const [version, setVersion] = useState(0)
  return <figure className="tear-preview">
    <Suspense fallback={<div className="tear-loading" aria-label="Loading ticket preview" />}>
    <DragTicket key={version} width={500} height={330} stubSize={60} radius={20} holes={18}
      holeSize={4} notch={8} rotate={0} tilt={false} parallax={0} recenter={false}
      background="#08180e" stubBackground="#173d1a" borderColor="#547c48"
      ariaLabel="Drag to tear the preview stub, or press Enter" onTear={() => setTorn(true)}
      className="drag-ticket-preview" stub={<div className="drag-ticket-stub"><span>ENTRANCE</span><span>PHOTOBOOTH</span><span>XXVI</span></div>}>
      <div className="drag-ticket-body">
        <img className="tear-photo" src="/images/hero-grass.png" alt="" width="1080" height="1350" />
        <div className="tear-art">
          <div className="tear-topline"><span>ISIPATHANA COLLEGE</span><span>XXVI</span></div>
          <img className="tear-logo" src="/images/greens-heaven-logo.png" width="425" height="179" alt="Greens Heaven" />
          <p className="tear-tagline">One evening. The whole batch.</p>
          <div className="tear-event"><div><strong>31 OCT</strong><span>2026 · 5:30 PM</span></div><div><strong>Solis Hotel</strong><span>2023 O/L · 2026 A/L</span></div></div>
          <div className="tear-bottom"><span>ONE PERSON</span><strong>{formatMoney(amount)}</strong></div>
        </div>
      </div>
    </DragTicket>
    </Suspense>
    <figcaption><span>Design preview · not an entry ticket</span>{torn ? <button type="button" onClick={() => { setVersion(value => value + 1); setTorn(false) }}><RotateCcw size={14} />Reset preview</button> : <span className="tear-drag-hint"><MoveRight size={14} />Drag the stub</span>}</figcaption>
  </figure>
}
