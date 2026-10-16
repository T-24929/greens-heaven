import { useCallback, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Tickets,
  ScanLine,
  Camera,
  Bell,
  ChevronRight,
  Search,
  Users,
  GraduationCap,
  AlertCircle,
  Receipt,
  MoreHorizontal,
  SlidersHorizontal,
} from 'lucide-react'
import FadeContent from '../FadeContent.jsx'
import { supabase } from '../../utils/supabase.js'
import { MorphingModal } from '../motion/morphing-modal.jsx'
import { Loader } from '../motion/loader.jsx'
import GateDesk from './GateDesk.jsx'
import { getAdminTabFromPath, getPathForAdminTab, navigateAdmin } from '../../lib/adminNavigation.js'
import '../ReviewDialog.css'
import '../../pages/AdminPage.css'

const labels = { pending_review: 'Pending review', approved: 'Confirmed', awaiting_payment: 'Awaiting receipt', rejected: 'Needs correction' }
const tabs = [['overview','Overview',LayoutDashboard],['tickets','Tickets',Tickets],['entrance','Entrance',ScanLine],['photobooth','Photos',Camera],['updates','Updates',Bell]]
const pageSize = 20
const listFields = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,status,amount_lkr,created_at'

export default function AdminWorkspace({ Detail, initialTicket, currentPath }) {
  const activePath = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '')
  const tab = getAdminTabFromPath(activePath, { hasInitialTicket: Boolean(initialTicket) }) || 'overview'
  const [selected, setSelected] = useState(initialTicket)
  const setTab = useCallback(nextTab => {
    if (selected) setSelected(null)
    navigateAdmin(nextTab)
  }, [selected])
  const [filter, setFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [emails, setEmails] = useState([])
  const [emailPage, setEmailPage] = useState(0)
  const [emailTotal, setEmailTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => { try { sessionStorage.removeItem('gh-scanned-ticket') } catch { /* optional */ } }, [])
  useEffect(() => {
    const handleRefresh = () => refresh()
    window.addEventListener('admin:refresh', handleRefresh)
    return () => window.removeEventListener('admin:refresh', handleRefresh)
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) refresh() }, 30000)
    return () => clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    let live = true
    supabase.rpc('admin_event_summary').then(({ data, error }) => {
      if (!live) return
      setSummaryError(error ? 'Summary unavailable. Check that the attendance migration is installed, then refresh.' : '')
      if (!error) setSummary(data)
    }).catch(() => { if (live) setSummaryError('Could not refresh totals. Check your connection.') })
    return () => { live = false }
  }, [revision])
  useEffect(() => {
    if (!['tickets','updates'].includes(tab)) return
    let live = true
    async function load() {
      setLoading(true); setError('')
      if (tab === 'updates') {
        const { data, error, count } = await supabase.from('notification_outbox').select('id,reservation_id,status,created_at,sent_at,attempts,reservations(reference,full_name)', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(emailPage * pageSize, (emailPage + 1) * pageSize - 1)
        if (!live) return
        if (error) throw error
        setEmails(data || []); setEmailTotal(count || 0)
      } else {
        let request = supabase.from('reservations').select(listFields, { count: 'exact' })
        if (filter !== 'all') request = request.eq('status', filter)
        // Strip PostgREST operators from free text; filter stays on the server.
        const term = query.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0,80)
        if (term) request = request.or(`full_name.ilike.%${term}%,reference.ilike.%${term}%`)
        if (sortOrder === 'oldest') request = request.order('created_at', { ascending: true })
        else if (sortOrder === 'name_asc') request = request.order('full_name', { ascending: true })
        else if (sortOrder === 'batch_desc') request = request.order('school_joined_year', { ascending: false })
        else request = request.order('created_at', { ascending: false })
        const { data, error, count } = await request.order('id', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
        if (!live) return
        if (error) throw error
        if (!data.length && page > 0) setPage(Math.max(0,Math.ceil(count / pageSize)-1))
        setRows(data || []); setTotal(count || 0)
      }
      setLoading(false)
    }
    load().catch(() => { if (live) { setLoading(false); setError('Could not load the latest records. Refresh to try again.') } })
    return () => { live = false }
  }, [tab,filter,query,sortOrder,page,emailPage,revision])
  useEffect(() => {
    const tabName = tabs.find(t => t[0] === tab)?.[1]
    if (tabName) document.title = `${tabName} · Admin · Greens Heaven`
  }, [tab])
  function showTickets(status) { setFilter(status); setPage(0); setTab('tickets'); setQuery(''); setSearch('') }
  const stats = [['pending_review','To review'],['approved','Confirmed'],['awaiting_payment','Awaiting receipt'],['rejected','Needs correction']]

  const totalReservations = (summary?.pending_review || 0) + (summary?.approved || 0) + (summary?.awaiting_payment || 0) + (summary?.rejected || 0)
  const pendingCount = summary?.pending_review || 0
  const approvedCount = summary?.approved || 0
  const awaitingCount = summary?.awaiting_payment || 0
  const rejectedCount = summary?.rejected || 0

  const pendingPct = totalReservations > 0 ? Math.round((pendingCount / totalReservations) * 100) : 0
  const approvedPct = totalReservations > 0 ? Math.round((approvedCount / totalReservations) * 100) : 0
  const awaitingPct = totalReservations > 0 ? Math.round(((awaitingCount + rejectedCount) / totalReservations) * 100) : 0

  return <div className="admin-workspace">
    <h1 className="sr-only">{tabs.find(t => t[0] === tab)?.[1]} · Admin</h1>
    {summaryError && <p className="admin-error" role="alert">{summaryError}</p>}
    {tab === 'overview' && <FadeContent trigger="mount" duration={.18} className="stack">
      <section className="admin-overview-banner"><p className="admin-eyebrow">BEFORE THE DOORS OPEN</p><h2>Keep the evening<br /><em>moving.</em></h2><p>Review receipts, follow delivery and welcome your batch.</p><button className="admin-button primary" onClick={() => showTickets('pending_review')}>Review pending receipts<ChevronRight size={17} /></button></section>
      <section className="admin-stats" aria-label="Reservation totals">{stats.map(([key,label]) => <button key={key} onClick={() => showTickets(key)}><span>{label}</span><strong>{summary?.[key] ?? '—'}</strong><ChevronRight size={16} /></button>)}</section>
      <div className="admin-two-up">{[['entrance','Entrance desk','Admit confirmed guests',ScanLine],['photobooth','Photo booth desk','Check ID and record the session',Camera]].map(([key,title,copy,Icon]) => <button key={key} className="admin-panel admin-gate-shortcut" onClick={() => setTab(key)}><Icon size={22} /><h3>{title}</h3><p>{copy}</p><strong>{summary?.[key] ?? '—'} recorded</strong></button>)}</div>
      <button className="admin-panel admin-updates-shortcut" onClick={() => setTab('updates')}><Bell size={21} /><span><strong>Email delivery</strong><small>{summary?.email_attention ?? '—'} waiting or needing attention</small></span><ChevronRight size={18} /></button>
    </FadeContent>}
    {tab === 'tickets' && <section className="admin-panel stack">
      {/* Top Metric Cards matching Image 2 */}
      <div className="admin-metrics-grid" role="region" aria-label="Reservation metrics">
        <button
          type="button"
          className={`admin-metric-card ${filter === 'all' ? 'active' : ''}`}
          onClick={() => { setFilter('all'); setPage(0) }}
        >
          <div className="admin-metric-card-top">
            <Users size={20} className="admin-metric-icon" />
            <span className="admin-metric-live-dot" />
          </div>
          <strong className="admin-metric-number">{totalReservations || total}</strong>
          <span className="admin-metric-label">All members</span>
          <span className="admin-metric-sub">Total active</span>
        </button>

        <button
          type="button"
          className={`admin-metric-card ${filter === 'pending_review' ? 'active' : ''}`}
          onClick={() => { setFilter('pending_review'); setPage(0) }}
        >
          <div className="admin-metric-card-top">
            <AlertCircle size={20} className="admin-metric-icon" />
            <span className="admin-metric-pct-badge">{pendingPct}%</span>
          </div>
          <strong className="admin-metric-number">{pendingCount}</strong>
          <span className="admin-metric-label">Pending review</span>
          <span className="admin-metric-sub">Needs review</span>
        </button>

        <button
          type="button"
          className={`admin-metric-card ${filter === 'approved' ? 'active' : ''}`}
          onClick={() => { setFilter('approved'); setPage(0) }}
        >
          <div className="admin-metric-card-top">
            <GraduationCap size={20} className="admin-metric-icon" />
            <span className="admin-metric-pct-badge">{approvedPct}%</span>
          </div>
          <strong className="admin-metric-number">{approvedCount}</strong>
          <span className="admin-metric-label">Confirmed</span>
          <span className="admin-metric-sub">Admitted guests</span>
        </button>

        <button
          type="button"
          className={`admin-metric-card ${['awaiting_payment','rejected'].includes(filter) ? 'active' : ''}`}
          onClick={() => { setFilter('awaiting_payment'); setPage(0) }}
        >
          <div className="admin-metric-card-top">
            <Receipt size={20} className="admin-metric-icon" />
            <span className="admin-metric-pct-badge">{awaitingPct}%</span>
          </div>
          <strong className="admin-metric-number">{awaitingCount + rejectedCount}</strong>
          <span className="admin-metric-label">Awaiting / Fix</span>
          <span className="admin-metric-sub">Pending receipt</span>
        </button>
      </div>

      {/* Filter pills */}
      <div className="admin-pill-group" role="tablist" aria-label="Status filters">
        {[
          ['all', 'All batches'],
          ['pending_review', 'Pending review'],
          ['approved', 'Confirmed'],
          ['awaiting_payment', 'Awaiting receipt'],
          ['rejected', 'Needs correction']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`admin-filter-pill ${filter === key ? 'active' : ''}`}
            onClick={() => { setFilter(key); setPage(0) }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search & Controls Toolbar matching Image 2 */}
      <div className="admin-table-toolbar">
        <form className="admin-toolbar-search" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(0) }}>
          <Search size={16} className="admin-search-icon" aria-hidden="true" />
          <label htmlFor="admin-search" className="sr-only">Search members</label>
          <input
            id="admin-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            maxLength={80}
            placeholder="Search members..."
          />
        </form>

        <div className="admin-toolbar-controls">
          <div className="admin-select-wrap">
            <SlidersHorizontal size={14} className="text-[#8ea488]" />
            <select
              value={filter}
              onChange={e => { setFilter(e.target.value); setPage(0) }}
              aria-label="Filter status"
              className="admin-select-input"
            >
              <option value="all">All</option>
              <option value="pending_review">Pending review</option>
              <option value="approved">Confirmed</option>
              <option value="awaiting_payment">Awaiting receipt</option>
              <option value="rejected">Needs correction</option>
            </select>
          </div>

          <div className="admin-select-wrap">
            <select
              value={sortOrder}
              onChange={e => { setSortOrder(e.target.value); setPage(0) }}
              aria-label="Sort members"
              className="admin-select-input"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="batch_desc">Batch</option>
            </select>
          </div>
        </div>
      </div>

      <div className="admin-table-count-label">
        {total} {total === 1 ? 'member' : 'members'}
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading ? (
        <div className="admin-empty"><Loader label="Loading reservations" /></div>
      ) : rows.length === 0 ? (
        <p className="admin-empty">No reservations match. Try another status or name.</p>
      ) : (
        <div className="admin-members-table-wrap">
          <table className="admin-members-table">
            <thead>
              <tr>
                <th scope="col">Member ^</th>
                <th scope="col">Member ID ^</th>
                <th scope="col">Admission no. ^</th>
                <th scope="col">Batch ^</th>
                <th scope="col">Status ^</th>
                <th scope="col" className="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row.id)}
                  className="admin-member-row"
                  tabIndex={0}
                  role="button"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(row.id) } }}
                  aria-label={`View reservation profile for ${row.full_name}`}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="admin-member-avatar">
                        {row.full_name.trim().charAt(0)}
                      </span>
                      <div className="admin-member-name-group">
                        <strong className="admin-member-name">{row.full_name}</strong>
                        <span className="admin-member-sub">
                          Joined {new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="admin-member-id-pill">
                      {row.reference}
                    </span>
                  </td>
                  <td>
                    <strong className="admin-admission-no">
                      {row.school_index_number || (row.nic_number ? row.nic_number.slice(0, 9) : '—')}
                    </strong>
                  </td>
                  <td>
                    <span className="admin-batch-text">
                      {row.school_joined_year || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-status-dot-badge ${row.status}`}>
                      <span className="admin-dot" />
                      <span>{labels[row.status] || row.status}</span>
                    </span>
                  </td>
                  <td className="text-right" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="admin-row-action-btn"
                      onClick={() => setSelected(row.id)}
                      aria-label={`Open details for ${row.reference}`}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} busy={loading} onPage={setPage} />
    </section>}
    {['entrance','photobooth'].includes(tab) && <GateDesk key={tab} gate={tab} onChange={refresh} onSelectTicket={setSelected} />}
    {tab === 'updates' && <section className="admin-panel stack"><h2>Delivery updates</h2><p className="muted">Approval and receipt-correction emails. Open a ticket to check delivery or retry a failed send.</p>{error && <p role="alert" className="admin-error">{error}</p>}{loading ? <Loader label="Loading delivery updates" /> : <ul className="admin-ticket-list">{emails.map(email => <li key={email.id}><button onClick={() => setSelected(email.reservation_id)}><Bell size={18} /><span className="admin-ticket-summary"><strong>{email.reservations?.full_name || 'Reservation update'}</strong><small>{email.reservations?.reference} · {new Date(email.created_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})}</small><span className={`admin-badge ${email.status}`}>{email.status === 'unknown' ? 'Check provider logs' : email.status === 'pending' ? 'Waiting to send' : email.status}</span></span><ChevronRight size={18} /></button></li>)}</ul>}{!loading && !emails.length && !error && <p className="admin-empty">No delivery updates yet.</p>}<Pagination page={emailPage} total={emailTotal} busy={loading} onPage={setEmailPage} /></section>}
    <MorphingModal
      viewId={selected ? 'ticket-details' : null}
      titleId="reservation-detail-heading"
      onClose={() => setSelected(null)}
    >
      <div className="admin-detail-dialog">
        {selected && (
          <Detail
            key={selected}
            reservationId={selected}
            onReview={refresh}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </MorphingModal>
    <nav className="admin-bottom-nav" aria-label="Admin navigation">{tabs.map(([key,label,Icon]) => <a key={key} href={getPathForAdminTab(key)} aria-current={tab === key ? 'page' : undefined} onClick={e => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); setTab(key) }}><Icon size={20} /><span>{label}</span>{key === 'updates' && summary?.email_attention > 0 && <i aria-label={`${summary.email_attention} emails need attention`} />}</a>)}</nav>
    <p className="admin-sync-note">Totals refresh every 30 seconds while this page is visible.</p>
  </div>
}

function Pagination({ page, total, busy, onPage }) {
  return <nav className="admin-pagination" aria-label="Results pages"><button className="admin-button" disabled={busy || page === 0} onClick={() => onPage(page-1)}>Previous</button><span>{page+1} / {Math.max(1,Math.ceil(total/pageSize))}</span><button className="admin-button" disabled={busy || (page+1)*pageSize >= total} onClick={() => onPage(page+1)}>Next</button></nav>
}
