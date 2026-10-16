import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'

export default function TicketScanner({ onScan }) {
  const video = useRef(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const callback = useRef(onScan)
  useEffect(() => { callback.current = onScan }, [onScan])
  useEffect(() => {
    if (!active) return
    let cancelled = false, scanner
    import('qr-scanner').then(async ({ default: QrScanner }) => {
      if (cancelled) return
      scanner = new QrScanner(video.current, result => {
        scanner.stop(); setActive(false); callback.current(result.data)
      }, { preferredCamera: 'environment', maxScansPerSecond: 5, returnDetailedScanResult: true, highlightScanRegion: true })
      try { await scanner.start(); if (cancelled) scanner.destroy() }
      catch { if (!cancelled) { setError('Camera unavailable. Allow camera access, or enter the ticket reference below.'); setActive(false) } }
    }).catch(() => { if (!cancelled) { setError('Could not start the scanner. Enter the ticket reference below.'); setActive(false) } })
    const hide = () => { if (document.hidden) setActive(false) }
    document.addEventListener('visibilitychange', hide)
    return () => { cancelled = true; scanner?.destroy(); document.removeEventListener('visibilitychange', hide) }
  }, [active])
  return <div className="admin-camera"><video ref={video} muted playsInline aria-label="Ticket QR camera" hidden={!active} />
    {!active && <div className="admin-camera-placeholder"><Camera size={32} /><p>Scan a ticket QR</p><span>Rear camera · No photos are stored</span></div>}
    <button className="admin-button" onClick={() => { setError(''); setActive(value => !value) }}>{active ? <CameraOff size={18} /> : <Camera size={18} />}{active ? 'Stop camera' : 'Start camera'}</button>
    {error && <p className="admin-error" role="alert">{error}</p>}
  </div>
}
