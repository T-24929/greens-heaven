import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy,
  CheckCircle2,
  ScanLine,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  History,
  Camera,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { parseTicketScan } from '../../lib/ticketScan.js'
import { useToast } from '../../lib/toasts.js'
import ReviewDialog from '../ReviewDialog.jsx'
import TicketScanner from './TicketScanner.jsx'

const time = (value) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function GateDesk({ gate, onChange, onSelectTicket }) {
  const photo = gate === 'photobooth'
  const label = photo ? 'Photo booth' : 'Entrance'
  const toast = useToast()

  const [tabMode, setTabMode] = useState('scan') // 'scan' | 'history' (mobile segmented switcher)
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
    const { data, error } = await supabase
      .from('ticket_attendance')
      .select('reservation_id,gate,checked_in_at,reservations(reference,full_name)')
      .eq('gate', gate)
      .order('checked_in_at', { ascending: false })
      .limit(20)
    setHistoryError(error ? 'Could not load recent check-ins. Refresh to try again.' : '')
    if (!error) setHistory(data || [])
  }, [gate])

  useEffect(() => {
    let live = true
    supabase
      .from('ticket_attendance')
      .select('reservation_id,gate,checked_in_at,reservations(reference,full_name)')
      .eq('gate', gate)
      .order('checked_in_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!live) return
        setHistoryError(error ? 'Could not load recent check-ins.' : '')
        if (!error) setHistory(data || [])
      })
      .catch(() => {
        if (live) setHistoryError('Could not load recent check-ins.')
      })
    return () => {
      live = false
    }
  }, [gate])

  useEffect(() => {
    const handleRefresh = () => refreshHistory()
    window.addEventListener('admin:refresh', handleRefresh)
    return () => window.removeEventListener('admin:refresh', handleRefresh)
  }, [refreshHistory])

  async function lookup(raw) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setTicket(null)
    setIdChecked(false)
    try {
      const parsed = parseTicketScan(raw, window.location.origin)
      const { data, error } = await supabase.rpc('lookup_event_ticket', { p_code: parsed })
      if (error) {
        throw new Error(
          error.code === 'P0002'
            ? 'Ticket not found. Check the reference and try again.'
            : 'Could not verify this ticket. Check your connection and admin access.'
        )
      }
      setTicket(data)
      setTabMode('scan') // Ensure the scan view is visible on mobile
    } catch (err) {
      setError(err.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function checkIn() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('check_in_ticket', {
        p_reservation_id: ticket.id,
        p_gate: gate,
        p_identity_checked: photo && idChecked,
      })
      if (error) {
        throw new Error(
          'Check-in was not confirmed. Look up the ticket again before retrying; it may already be recorded.'
        )
      }
      setTicket((current) => ({
        ...current,
        attendance: [
          ...current.attendance.filter((a) => a.gate !== gate),
          { gate, checked_in_at: data.checked_in_at },
        ],
      }))
      toast.show({
        status: 'success',
        title: data.already_recorded ? `${label} already recorded` : `${label} check-in saved`,
      })
      await refreshHistory()
      onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const recorded = ticket?.attendance?.find((item) => item.gate === gate)

  return (
    <div className="admin-gate-layout">
      {/* Mobile-Only Segmented View Switcher (World ID / Native App Style) */}
      <div className="admin-gate-segmented" role="tablist" aria-label="Gate navigation modes">
        <button
          type="button"
          role="tab"
          aria-selected={tabMode === 'scan'}
          className={`admin-gate-seg-btn ${tabMode === 'scan' ? 'active' : ''}`}
          onClick={() => setTabMode('scan')}
        >
          <Camera size={15} />
          <span>Ticket Scanner</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tabMode === 'history'}
          className={`admin-gate-seg-btn ${tabMode === 'history' ? 'active' : ''}`}
          onClick={() => setTabMode('history')}
        >
          <History size={15} />
          <span>Recent Arrivals ({history.length})</span>
        </button>
      </div>

      {/* Main Scanner Section */}
      <section
        className={`admin-panel stack ${tabMode === 'history' ? 'admin-panel-hidden-mobile' : ''}`}
      >
        {/* Compact Native Gate Header */}
        <div className="admin-gate-header-bar">
          <div className="admin-gate-badge-row">
            <span className="admin-gate-pill">
              <span className="admin-gate-dot" />
              {photo ? 'GATE 02 · PHOTO BOOTH' : 'GATE 01 · ENTRANCE'}
            </span>
            <span className="admin-gate-count-chip">
              <strong>{history.length}</strong> admitted
            </span>
          </div>
          <p className="admin-gate-subtitle">
            {photo
              ? 'Scan attendee ticket QR or look up reference to record photo booth session.'
              : 'Scan attendee ticket QR or look up reference for instant gate arrival check-in.'}
          </p>
        </div>

        {/* Live Camera Viewfinder */}
        <TicketScanner onScan={lookup} />

        {/* Manual Reference Code Lookup */}
        <form
          className="admin-manual-search"
          onSubmit={(event) => {
            event.preventDefault()
            lookup(code)
          }}
        >
          <div className="admin-manual-input-wrap">
            <Search size={17} className="admin-manual-icon" />
            <input
              id="gate-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="GH-003 or paste link…"
              aria-label="Ticket reference code or link"
              maxLength={500}
              autoComplete="off"
              spellCheck="false"
            />
            {code && (
              <button
                type="button"
                className="admin-manual-clear"
                onClick={() => setCode('')}
                aria-label="Clear input"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="admin-manual-submit"
            disabled={busy || !code.trim()}
          >
            <ScanLine size={16} />
            <span>{busy ? 'Verifying…' : 'Look Up'}</span>
          </button>
        </form>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        {/* Scanned Attendee Ticket Card (Apple Wallet / Native Card Style) */}
        {ticket && (
          <div className="admin-scan-result-card" aria-live="polite">
            <div className="admin-scan-result-header">
              <span
                className={`admin-scan-status-badge ${
                  ticket.status === 'approved'
                    ? recorded
                      ? 'recorded'
                      : 'approved'
                    : 'rejected'
                }`}
              >
                {ticket.status !== 'approved' ? (
                  <>
                    <AlertCircle size={14} /> Unconfirmed Ticket
                  </>
                ) : recorded ? (
                  <>
                    <CheckCircle2 size={14} /> Already Checked In
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Confirmed Attendee
                  </>
                )}
              </span>
              <button
                type="button"
                className="admin-result-close"
                onClick={() => setTicket(null)}
                aria-label="Close ticket details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="admin-scan-attendee-info">
              <div className="admin-scan-avatar">
                {ticket.full_name?.trim().charAt(0) || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="admin-scan-name">{ticket.full_name}</h3>
                <div className="admin-scan-ref-row">
                  <span className="admin-scan-ref">{ticket.reference}</span>
                  <button
                    type="button"
                    className="admin-scan-copy-btn"
                    title="Copy ticket reference"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(ticket.reference)
                        toast.show({ status: 'success', title: 'Ticket reference copied' })
                      } catch {
                        setError('Could not copy reference.')
                      }
                    }}
                  >
                    <Copy size={12} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>

            {ticket.status !== 'approved' ? (
              <p className="admin-error mt-2">
                Payment approval is required before this attendee can be admitted.
              </p>
            ) : recorded ? (
              <div className="admin-already-admitted-box">
                <CheckCircle2 size={16} className="text-[#84e098] shrink-0" />
                <p className="text-xs text-[#b7dfb6]">
                  Arrival recorded at {time(recorded.checked_in_at)}
                </p>
              </div>
            ) : (
              <div className="mt-2 stack">
                {photo && (
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={idChecked}
                      onChange={(e) => setIdChecked(e.target.checked)}
                    />
                    <span>I verified attendee’s identity against this reservation name.</span>
                  </label>
                )}
                <button
                  type="button"
                  className="admin-admit-btn"
                  disabled={busy || (photo && !idChecked)}
                  onClick={() => setConfirm(true)}
                >
                  <CheckCircle2 size={18} />
                  <span>Confirm {photo ? 'Photo Booth Session' : 'Entrance Check-in'}</span>
                </button>
              </div>
            )}

            <div className="admin-gate-status-pills">
              {['entrance', 'photobooth'].map((key) => {
                const isDone = ticket.attendance?.some((a) => a.gate === key)
                return (
                  <span key={key} className={`admin-gate-status-chip ${isDone ? 'done' : ''}`}>
                    {key === 'entrance' ? 'Entrance' : 'Photo booth'}:{' '}
                    {isDone ? '✓ Admitted' : 'Pending'}
                  </span>
                )
              })}
            </div>

            {onSelectTicket && (
              <button
                type="button"
                className="admin-scan-sheet-link"
                onClick={() => onSelectTicket(ticket.id)}
              >
                <FileText size={13} />
                <span>View Full Details & Receipt Sheet</span>
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        )}

        <ReviewDialog
          open={confirm}
          title={`Record ${label.toLowerCase()}?`}
          description={
            photo
              ? 'The photographer can use this ticket ID to name the image folder. Photos are managed outside this site.'
              : 'This records one entrance check-in for this ticket.'
          }
          fields={
            ticket
              ? [
                  ['Attendee', ticket.full_name],
                  ['Ticket ID', ticket.reference],
                  ['Gate', label],
                ]
              : []
          }
          confirmLabel="Confirm check-in"
          onClose={() => setConfirm(false)}
          onConfirm={checkIn}
        />
      </section>

      {/* Recent Check-ins History Section */}
      <section
        className={`admin-panel stack ${tabMode === 'scan' ? 'admin-panel-hidden-mobile' : ''}`}
      >
        <div className="admin-section-title">
          <div>
            <h2>Recent arrivals</h2>
            <p className="muted text-xs">Latest 20 check-ins at {label.toLowerCase()}</p>
          </div>
          <button
            type="button"
            className="admin-icon"
            aria-label="Refresh check-ins"
            onClick={() =>
              refreshHistory().catch(() => setHistoryError('Could not refresh check-ins.'))
            }
          >
            <RefreshCw size={17} />
          </button>
        </div>

        {historyError && (
          <p role="alert" className="admin-error">
            {historyError}
          </p>
        )}

        {!history.length && !historyError && (
          <div className="admin-empty">
            <History size={32} className="mx-auto text-[#627d65] mb-2" />
            <p>No arrivals recorded at this gate yet.</p>
          </div>
        )}

        {history.length > 0 && (
          <ul className="admin-native-history-list">
            {history.map((item) => (
              <li key={item.reservation_id}>
                <button
                  type="button"
                  className="admin-native-history-row admin-history-clickable"
                  onClick={() => onSelectTicket?.(item.reservation_id)}
                  aria-label={`Open reservation details for ${item.reservations?.full_name || 'Guest'}`}
                >
                  <div className="admin-history-avatar">
                    {item.reservations?.full_name?.trim().charAt(0) || 'G'}
                  </div>
                  <div className="admin-history-details">
                    <strong>{item.reservations?.full_name || 'Guest'}</strong>
                    <span className="admin-history-ref">{item.reservations?.reference}</span>
                  </div>
                  <div className="admin-history-meta">
                    <span className="admin-history-time">
                      {new Date(item.checked_in_at).toLocaleTimeString('en-GB', {
                        timeZone: 'Asia/Colombo',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <ChevronRight size={14} className="admin-history-chevron" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
