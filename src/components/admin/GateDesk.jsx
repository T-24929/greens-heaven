import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, CheckCircle2, ScanLine, RefreshCw } from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { parseTicketScan } from '../../lib/ticketScan.js'
import { useToast } from '../../lib/toasts.js'
import ReviewDialog from '../ReviewDialog.jsx'
import TicketScanner from './TicketScanner.jsx'

const time = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export default function GateDesk({ gate, onChange }) {
  const photo = gate === 'photobooth'
  const label = photo ? 'Photo booth' : 'Entrance'
  const toast = useToast()
  const [code, setCode] = useState('')
  const [ticket, setTicket] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [idChecked, setIdChecked] = useState(false)
  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState('')
  const lock = useRef(false)
  const refreshHistory = useCallback(async () => {
    const { data, error } = await supabase.from('ticket_attendance').select('reservation_id,gate,checked_in_at,reservations(reference,full_name)').eq('gate', gate).order('checked_in_at', { ascending: false }).limit(20)
    setHistoryError(error ? 'Could not load recent check-ins. Refresh to try again.' : '')
    if (!error) setHistory(data || [])
  }, [gate])
  useEffect(() => {
    let live = true
    supabase.from('ticket_attendance').select('reservation_id,gate,checked_in_at,reservations(reference,full_name)').eq('gate', gate).order('checked_in_at', { ascending: false }).limit(20).then(({ data, error }) => {
      if (!live) return
      setHistoryError(error ? 'Could not load recent check-ins.' : '')
      if (!error) setHistory(data || [])
    }).catch(() => { if (live) setHistoryError('Could not load recent check-ins.') })
    return () => { live = false }
  }, [gate])
  async function lookup(raw) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setTicket(null); setIdChecked(false)
    try {
      const parsed = parseTicketScan(raw, window.location.origin)
      const { data, error } = await supabase.rpc('lookup_event_ticket', { p_code: parsed })
      if (error) throw new Error(error.code === 'P0002' ? 'Ticket not found. Check the reference and try again.' : 'Could not verify this ticket. Check your connection and admin access.')
      setTicket(data)
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  async function checkIn() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('check_in_ticket', { p_reservation_id: ticket.id, p_gate: gate, p_identity_checked: photo && idChecked })
      if (error) throw new Error('Check-in was not confirmed. Look up the ticket again before retrying; it may already be recorded.')
      setTicket(current => ({ ...current, attendance: [...current.attendance.filter(a => a.gate !== gate), { gate, checked_in_at: data.checked_in_at }] }))
      toast.show({ status: 'success', title: data.already_recorded ? `${label} already recorded` : `${label} check-in saved` })
      await refreshHistory(); onChange()
    } catch (err) { setError(err.message) }
    finally { lock.current = false; setBusy(false) }
  }
  const recorded = ticket?.attendance?.find(item => item.gate === gate)
  return <div className="admin-gate-layout"><section className="admin-panel stack">
    <div><p className="admin-eyebrow">EVENT DAY · {photo ? 'GATE 02' : 'GATE 01'}</p><h2>{label} desk.</h2><p className="muted">{photo ? 'Check ID, record the session and copy the ticket ID for the photo folder.' : 'Scan, verify the attendee and record their arrival.'}</p></div>
    <TicketScanner onScan={lookup} />
    <form className="admin-search" onSubmit={event => { event.preventDefault(); lookup(code) }}><label htmlFor="gate-code" className="sr-only">Ticket reference or QR link</label><input id="gate-code" value={code} onChange={event => setCode(event.target.value)} placeholder="GH-003 or ticket QR link" maxLength={500} autoComplete="off" /><button className="admin-button" disabled={busy || !code.trim()}><ScanLine size={18} />{busy ? 'Checking…' : 'Find'}</button></form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {ticket && <div className="admin-scan-result" aria-live="polite"><p className="admin-eyebrow">{ticket.status === 'approved' ? 'CONFIRMED TICKET' : 'ENTRY NOT CONFIRMED'}</p><h3>{ticket.full_name}</h3><div className="admin-ticket-code"><strong>{ticket.reference}</strong><button className="admin-icon" aria-label="Copy ticket ID" onClick={async () => { try { await navigator.clipboard.writeText(ticket.reference); toast.show({ status: 'success', title: 'Ticket ID copied' }) } catch { setError('Could not copy. Select the ticket ID above to copy it.') } }}><Copy size={18} /></button></div>
      {ticket.status !== 'approved' ? <p className="admin-error">Payment approval is required. This ticket cannot check in.</p> : recorded ? <p className="admin-success"><CheckCircle2 size={18} />Already recorded · {time(recorded.checked_in_at)}</p> : <>
        {photo && <label className="admin-check"><input type="checkbox" checked={idChecked} onChange={e => setIdChecked(e.target.checked)} />I checked the attendee’s ID against this name.</label>}
        <button className="admin-button primary" disabled={busy || (photo && !idChecked)} onClick={() => setConfirm(true)}>Record {photo ? 'photo session' : 'entrance'}</button>
      </>}
      <div className="admin-gate-status">{['entrance','photobooth'].map(key => <span key={key}>{key === 'entrance' ? 'Entrance' : 'Photo booth'}: {ticket.attendance.some(a => a.gate === key) ? 'Recorded' : 'Not recorded'}</span>)}</div>
    </div>}
    <ReviewDialog open={confirm} title={`Record ${label.toLowerCase()}?`} description={photo ? 'The photographer can use this ticket ID to name the image folder. Photos are managed outside this site.' : 'This records one entrance for this ticket.'} fields={ticket ? [['Attendee',ticket.full_name],['Ticket ID',ticket.reference],['Gate',label]] : []} confirmLabel="Confirm check-in" onClose={() => setConfirm(false)} onConfirm={checkIn} />
  </section><section className="admin-panel stack"><div className="admin-section-title"><h2>Recent check-ins</h2><button className="admin-icon" aria-label="Refresh check-ins" onClick={() => refreshHistory().catch(() => setHistoryError('Could not refresh check-ins.'))}><RefreshCw size={18} /></button></div><p className="muted">Latest 20 at {label.toLowerCase()} · Sri Lanka time</p>{historyError && <p role="alert" className="admin-error">{historyError}</p>}{!history.length && !historyError && <p className="admin-empty">No check-ins at this gate yet.</p>}<ul className="admin-records">{history.map(item => <li key={item.reservation_id}><div><strong>{item.reservations?.reference}</strong><span>{item.reservations?.full_name}</span></div><time>{time(item.checked_in_at)}</time></li>)}</ul></section></div>
}
