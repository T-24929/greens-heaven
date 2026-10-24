import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'

const filters = [
  ['all', 'All gates'],
  ['entrance', 'Entrance'],
  ['photobooth', 'Photo booth'],
]

function formatCount(value) {
  return value == null ? '—' : Number(value).toLocaleString('en-LK')
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminArrivals({ summary, summaryError, onSelectTicket }) {
  const [gateFilter, setGateFilter] = useState('all')
  const [arrivals, setArrivals] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const hasLoaded = useRef(false)

  useEffect(() => {
    let active = true
    setLoading(!hasLoaded.current)
    setRefreshing(hasLoaded.current)

    let request = supabase
      .from('ticket_attendance')
      .select('reservation_id,gate,checked_in_at,identity_checked,reservations(reference,full_name)')
      .order('checked_in_at', { ascending: false })
      .limit(50)

    if (gateFilter !== 'all') request = request.eq('gate', gateFilter)

    request
      .then(({ data, error: queryError }) => {
        if (!active) return
        setError(queryError ? 'Arrivals could not be loaded. Refresh to try again.' : '')
        setArrivals(queryError ? [] : data || [])
        hasLoaded.current = true
        setLoading(false)
        setRefreshing(false)
      })
      .catch(() => {
        if (!active) return
        setError('Arrivals could not be loaded. Check your connection and try again.')
        hasLoaded.current = true
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      active = false
    }
  }, [gateFilter, reloadKey])

  useEffect(() => {
    const refreshArrivals = () => setReloadKey((current) => current + 1)
    window.addEventListener('admin:refresh', refreshArrivals)
    return () => window.removeEventListener('admin:refresh', refreshArrivals)
  }, [])

  const approved = summary?.approved
  const entrance = summary?.entrance
  const photoSessions = summary?.photobooth
  const remaining = approved == null ? null : Math.max(0, approved - (entrance || 0))
  const arrivalRate = approved > 0 ? Math.round(((entrance || 0) / approved) * 100) : 0

  return (
    <div className="admin-arrivals-page">
      <header className="admin-arrivals-heading">
        <div>
          <p className="admin-eyebrow">EVENT CHECK-IN</p>
          <h2>Arrivals</h2>
          <p className="muted">Attendance totals and the latest guest check-ins.</p>
        </div>
        <button
          type="button"
          className="admin-icon admin-arrivals-refresh"
          onClick={() => setReloadKey((current) => current + 1)}
          aria-label="Refresh arrivals"
          title="Refresh arrivals"
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'admin-spin' : ''} />
        </button>
      </header>

      <section className="admin-arrivals-stats" aria-label="Attendance totals">
        <article className="admin-arrivals-stat">
          <span className="admin-arrivals-stat-icon"><Users size={17} /></span>
          <span className="admin-stat-label">Expected</span>
          <strong className="admin-stat-value">{formatCount(approved)}</strong>
          <span className="admin-arrivals-stat-note">Approved tickets</span>
        </article>
        <article className="admin-arrivals-stat is-highlighted">
          <span className="admin-arrivals-stat-icon"><ScanLine size={17} /></span>
          <span className="admin-stat-label">Entrance</span>
          <strong className="admin-stat-value">
            {formatCount(entrance)}
            <span className="admin-stat-sub">{approved > 0 ? ` ${arrivalRate}%` : ''}</span>
          </strong>
          <span className="admin-arrivals-stat-note">Checked at Entrance</span>
        </article>
        <article className="admin-arrivals-stat">
          <span className="admin-arrivals-stat-icon is-photo"><Camera size={17} /></span>
          <span className="admin-stat-label">Photo sessions</span>
          <strong className="admin-stat-value">{formatCount(photoSessions)}</strong>
          <span className="admin-arrivals-stat-note">Recorded at Booth</span>
        </article>
        <article className="admin-arrivals-stat">
          <span className="admin-arrivals-stat-icon is-pending"><Clock3 size={17} /></span>
          <span className="admin-stat-label">Remaining</span>
          <strong className="admin-stat-value">{formatCount(remaining)}</strong>
          <span className="admin-arrivals-stat-note">Remaining to arrive</span>
        </article>
      </section>

      {summaryError && <p className="admin-error" role="alert">{summaryError}</p>}

      <section className="admin-panel admin-arrivals-panel">
        <div className="admin-arrivals-panel-heading">
          <div>
            <div className="admin-arrivals-title-row">
              <h3>Recent arrivals</h3>
              <span className="admin-arrivals-count">{arrivals.length}</span>
            </div>
            <p className="muted">Most recent check-ins, shown in local event time.</p>
          </div>

          <div className="admin-arrivals-filters" role="group" aria-label="Filter arrivals by gate">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={gateFilter === key}
                className={gateFilter === key ? 'is-active' : ''}
                onClick={() => setGateFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="admin-arrivals-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((current) => current + 1)}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <p className="admin-arrivals-empty" role="status">Loading recent arrivals…</p>
        ) : error ? null : arrivals.length ? (
          <ul className="admin-arrivals-list" aria-live="polite">
            {arrivals.map((item) => {
              const name = item.reservations?.full_name || 'Attendee'
              const reference = item.reservations?.reference || 'Ticket ID unavailable'
              const isPhoto = item.gate === 'photobooth'
              const GateIcon = isPhoto ? Camera : ScanLine

              return (
                <li key={`${item.reservation_id}-${item.gate}`}>
                  <button
                    type="button"
                    className="admin-arrivals-row"
                    onClick={() => onSelectTicket?.(item.reservation_id)}
                    aria-label={`Open ${name}, ticket ${reference}, ${isPhoto ? 'photo booth' : 'entrance'}, ${formatTime(item.checked_in_at)}`}
                  >
                    <span className="admin-arrivals-avatar" aria-hidden="true">
                      {name.trim().charAt(0) || 'A'}
                    </span>
                    <span className="admin-arrivals-person">
                      <strong>{name}</strong>
                      <span>{reference}</span>
                    </span>
                    <span className={`admin-arrivals-gate ${isPhoto ? 'is-photo' : ''}`}>
                      <GateIcon size={14} />
                      <span>{isPhoto ? 'Photo booth' : 'Entrance'}</span>
                    </span>
                    <span className="admin-arrivals-time">{formatTime(item.checked_in_at)}</span>
                    <span className={`admin-arrivals-identity ${item.identity_checked ? 'is-verified' : ''}`}>
                      {item.identity_checked ? <ShieldCheck size={14} /> : <CheckCircle2 size={14} />}
                      <span>{item.identity_checked ? 'ID checked' : 'Admitted'}</span>
                    </span>
                    <ChevronRight size={17} className="admin-arrivals-chevron" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="admin-arrivals-empty">
            <span className="admin-arrivals-empty-icon"><Clock3 size={20} /></span>
            <strong>No arrivals yet</strong>
            <span>Guest check-ins will appear here as they are recorded.</span>
          </div>
        )}

        {!loading && arrivals.length === 50 && (
          <p className="admin-arrivals-footnote">Showing the latest 50 check-ins.</p>
        )}
      </section>
    </div>
  )
}
