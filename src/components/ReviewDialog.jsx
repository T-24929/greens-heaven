import { useId, useRef, useState } from 'react'
import { MorphingModal } from './motion/morphing-modal.jsx'
import { Loader } from './motion/loader.jsx'
import './ReviewDialog.css'

export default function ReviewDialog({ open, title, description, fields, confirmLabel, onClose, onConfirm }) {
  const id = useId()
  const guard = useRef(false)
  const [busy, setBusy] = useState(false)
  async function confirm() {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    try { await onConfirm() } finally { guard.current = false; setBusy(false); onClose() }
  }
  return <MorphingModal viewId={open ? busy ? 'saving' : 'review' : null} onClose={onClose} busy={busy} titleId={id}>
    <h2 id={id}>{busy ? 'Just a moment…' : title}</h2>
    {busy ? <div className="gh-modal-saving"><Loader size={28} label="Saving" /><p>Keep this page open.</p></div> : <>
      <p className="gh-modal-description">{description}</p>
      <dl className="gh-modal-details">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
      <div className="gh-modal-actions"><button type="button" onClick={onClose}>Go back</button><button type="button" className="gh-modal-confirm" onClick={confirm}>{confirmLabel}</button></div>
    </>}
  </MorphingModal>
}
