import { useCallback, useEffect, useState } from 'react'
import { LayoutDashboard, Tickets, ScanLine, Camera, Bell, RefreshCw, ChevronRight, Search, X } from 'lucide-react'
import FadeContent from '../FadeContent.jsx'
import { supabase } from '../../utils/supabase.js'
import { MorphingModal } from '../motion/morphing-modal.jsx'
import { Loader } from '../motion/loader.jsx'
import GateDesk from './GateDesk.jsx'
import '../ReviewDialog.css'
import '../../pages/AdminPage.css'

const labels = { pending_review: 'Pending review', approved: 'Confirmed', awaiting_payment: 'Awaiting receipt', rejected: 'Needs correction' }
const tabs = [['overview','Overview',LayoutDashboard],['tickets','Tickets',Tickets],['entrance','Entrance',ScanLine],['photobooth','Photos',Camera],['updates','Updates',Bell]]
const pageSize = 20
const listFields = 'id,reference,full_name,status,amount_lkr,created_at'

export default function AdminWorkspace({ Detail, initialTicket }) {
  const [tab, setTab] = useState(initialTicket ? 'tickets' : 'overview')
  const [selected, setSelected] = useState(initialTicket)
  const [filter, setFilter] = useState('pending_review')
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
        const { data, error, count } = await request.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1)
        if (!live) return
        if (error) throw error
        if (!data.length && page > 0) setPage(Math.max(0,Math.ceil(count / pageSize)-1))
        setRows(data || []); setTotal(count || 0)
      }
      setLoading(false)
    }
    load().catch(() => { if (live) { setLoading(false); setError('Could not load the latest records. Refresh to try again.') } })
    return () => { live = false }
  }, [tab,filter,query,page,emailPage,revision])
  function showTickets(status) { setFilter(status); setPage(0); setTab('tickets'); setQuery(''); setSearch('') }
  const stats = [['pending_review','To review'],['approved','Confirmed'],['awaiting_payment','Awaiting receipt'],['rejected','Needs correction']]
  return <div className="admin-workspace">
    <header className="admin-heading"><div><p className="admin-eyebrow">GREENS HEAVEN · ORGANIZER DESK</p><h1>{tabs.find(t => t[0] === tab)?.[1]}<em>.</em></h1><p>31 October 2026 · Solis Hotel</p></div><button className="admin-icon" aria-label="Refresh admin data" onClick={refresh}><RefreshCw size={19} /></button></header>
    {summaryError && <p className="admin-error" role="alert">{summaryError}</p>}
    {tab === 'overview' && <FadeContent trigger="mount" duration={.18} className="stack">
      <section className="admin-overview-banner"><p className="admin-eyebrow">BEFORE THE DOORS OPEN</p><h2>Keep the evening<br /><em>moving.</em></h2><p>Review receipts, follow delivery and welcome your batch.</p><button className="admin-button primary" onClick={() => showTickets('pending_review')}>Review pending receipts<ChevronRight size={17} /></button></section>
      <section className="admin-stats" aria-label="Reservation totals">{stats.map(([key,label]) => <button key={key} onClick={() => showTickets(key)}><span>{label}</span><strong>{summary?.[key] ?? '—'}</strong><ChevronRight size={16} /></button>)}</section>
      <div className="admin-two-up">{[['entrance','Entrance desk','Admit confirmed guests',ScanLine],['photobooth','Photo booth desk','Check ID and record the session',Camera]].map(([key,title,copy,Icon]) => <button key={key} className="admin-panel admin-gate-shortcut" onClick={() => setTab(key)}><Icon size={22} /><h3>{title}</h3><p>{copy}</p><strong>{summary?.[key] ?? '—'} recorded</strong></button>)}</div>
      <button className="admin-panel admin-updates-shortcut" onClick={() => setTab('updates')}><Bell size={21} /><span><strong>Email delivery</strong><small>{summary?.email_attention ?? '—'} waiting or needing attention</small></span><ChevronRight size={18} /></button>
    </FadeContent>}
    {tab === 'tickets' && <section className="admin-panel stack"><div className="admin-section-title"><h2>Reservations</h2><span className="admin-count">{total}</span></div><div className="admin-filters" aria-label="Filter reservations">{[['all','All'],...Object.entries(labels)].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0) }}>{label}</button>)}</div><form className="admin-search" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(0) }}><label htmlFor="admin-search" className="sr-only">Search name or ticket reference</label><input id="admin-search" value={search} onChange={e => setSearch(e.target.value)} maxLength={80} placeholder="Name or GH-003" /><button className="admin-icon" aria-label="Search reservations"><Search size={18} /></button></form>
      {error && <p className="admin-error" role="alert">{error}</p>}{loading ? <div className="admin-empty"><Loader label="Loading reservations" /></div> : <><ul className="admin-ticket-list">{rows.map(row => <li key={row.id}><button onClick={() => setSelected(row.id)} aria-label={`View ${row.reference} for ${row.full_name}`}><span className="admin-avatar">{row.full_name.trim().charAt(0)}</span><span className="admin-ticket-summary"><strong>{row.full_name}</strong><small>{row.reference} · Rs. {row.amount_lkr.toLocaleString('en-LK')}</small><span className={`admin-badge ${row.status}`}>{labels[row.status]}</span></span><ChevronRight size={18} /></button></li>)}</ul>{!rows.length && !error && <p className="admin-empty">No reservations match. Try another status or name.</p>}</>}
      <Pagination page={page} total={total} busy={loading} onPage={setPage} />
    </section>}
    {['entrance','photobooth'].includes(tab) && <GateDesk key={tab} gate={tab} onChange={refresh} />}
    {tab === 'updates' && <section className="admin-panel stack"><h2>Delivery updates</h2><p className="muted">Approval and receipt-correction emails. Open a ticket to check delivery or retry a failed send.</p>{error && <p role="alert" className="admin-error">{error}</p>}{loading ? <Loader label="Loading delivery updates" /> : <ul className="admin-ticket-list">{emails.map(email => <li key={email.id}><button onClick={() => setSelected(email.reservation_id)}><Bell size={18} /><span className="admin-ticket-summary"><strong>{email.reservations?.full_name || 'Reservation update'}</strong><small>{email.reservations?.reference} · {new Date(email.created_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})}</small><span className={`admin-badge ${email.status}`}>{email.status === 'unknown' ? 'Check provider logs' : email.status === 'pending' ? 'Waiting to send' : email.status}</span></span><ChevronRight size={18} /></button></li>)}</ul>}{!loading && !emails.length && !error && <p className="admin-empty">No delivery updates yet.</p>}<Pagination page={emailPage} total={emailTotal} busy={loading} onPage={setEmailPage} /></section>}
    <MorphingModal viewId={selected ? 'ticket-details' : null} titleId="reservation-detail-heading" onClose={() => setSelected(null)}><div className="admin-detail-dialog"><button className="admin-icon admin-close" aria-label="Close reservation details" onClick={() => setSelected(null)}><X size={19} /></button>{selected && <Detail key={selected} reservationId={selected} onReview={refresh} />}</div></MorphingModal>
    <nav className="admin-bottom-nav" aria-label="Admin navigation">{tabs.map(([key,label,Icon]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}><Icon size={20} /><span>{label}</span>{key === 'updates' && summary?.email_attention > 0 && <i aria-label={`${summary.email_attention} emails need attention`} />}</button>)}</nav>
    <p className="admin-sync-note">Totals refresh every 30 seconds while this page is visible.</p>
  </div>
}

function Pagination({ page, total, busy, onPage }) {
  return <nav className="admin-pagination" aria-label="Results pages"><button className="admin-button" disabled={busy || page === 0} onClick={() => onPage(page-1)}>Previous</button><span>{page+1} / {Math.max(1,Math.ceil(total/pageSize))}</span><button className="admin-button" disabled={busy || (page+1)*pageSize >= total} onClick={() => onPage(page+1)}>Next</button></nav>
}
