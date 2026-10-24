import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard,
  Tickets,
  ScanLine,
  Camera,
  Bell,
  ChevronRight,
  ChevronDown,
  Search,
  Users,
  GraduationCap,
  AlertCircle,
  Receipt,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  RotateCcw,
  CircleDollarSign,
  Clock3,
} from 'lucide-react'
import FadeContent from '../FadeContent.jsx'
import { supabase } from '../../utils/supabase.js'
import { MorphingModal } from '../motion/morphing-modal.jsx'
import { Loader } from '../motion/loader.jsx'
import GateDesk from './GateDesk.jsx'
import AdminArrivals from './AdminArrivals.jsx'
import AdminRevenueDashboard from './AdminRevenueDashboard.jsx'
import { getAdminTabFromPath, getAdminGateFromPath, navigateAdmin } from '../../lib/adminNavigation.js'
import { useToast } from '../../lib/toasts.js'
import { getAdminsList, buildAdminMap } from '../../lib/admins.js'
import AdminNotificationBanner from './AdminNotificationBanner.jsx'
import AdminBottomNav from './AdminBottomNav.jsx'
import '../ReviewDialog.css'
import '../../pages/AdminPage.css'

const labels = { pending_review: 'Pending review', approved: 'Confirmed', awaiting_payment: 'Awaiting receipt', rejected: 'Needs correction' }
const tabs = [
  ['overview', 'Overview', LayoutDashboard],
  ['tickets', 'Tickets', Tickets],
  ['revenue', 'Revenue', CircleDollarSign],
  ['attendance', 'Attendance', ScanLine],
  ['arrivals', 'Arrivals', Clock3],
  ['updates', 'Updates', Bell],
]
const pageSize = 20
const listFields = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,status,amount_lkr,created_at,reviewed_by'
const BATCH_YEARS = Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i)

function AttendanceGateChooser() {
  const gates = [
    {
      id: 'entrance',
      name: 'Entrance',
      number: 'GATE 01',
      description: 'Scan tickets at the main entrance.',
      image: '/images/attendance-entrance.jpg',
      Icon: ScanLine,
    },
    {
      id: 'photobooth',
      name: 'Photo booth',
      number: 'GATE 02',
      description: 'Verify a guest, then open their photo session.',
      image: '/images/hero-grass.png',
      Icon: Camera,
    },
  ]

  return (
    <section className="admin-attendance-home" aria-labelledby="admin-attendance-home-title">
      <header className="admin-attendance-heading">
        <div>
          <p className="admin-eyebrow">GATE OPERATIONS</p>
          <h2 id="admin-attendance-home-title">Attendance</h2>
          <p className="muted">Choose a gate to start scanning.</p>
        </div>
      </header>
      <nav className="admin-attendance-gate-grid" aria-label="Attendance gates">
        {gates.map(({ id, name, number, description, image, Icon }) => (
          <a
            key={id}
            className="admin-attendance-gate-card"
            data-gate={id}
            href={`/admin/dashboard/attendance/${id}`}
            aria-label={`Open ${name} scanner`}
          >
            <span className="admin-attendance-gate-art" aria-hidden="true">
              <img src={image} alt="" loading="lazy" decoding="async" />
            </span>
            <span className="admin-attendance-gate-card-top">
              <span className="admin-attendance-gate-number"><span aria-hidden="true" />{number}</span>
            </span>
            <span className="admin-attendance-gate-card-body">
              <span className="admin-attendance-gate-icon"><Icon size={20} aria-hidden="true" /></span>
              <span className="admin-attendance-gate-copy">
                <strong>{name}</strong>
                <span>{description}</span>
              </span>
              <span className="admin-attendance-gate-arrow" aria-hidden="true">
                <ChevronRight size={19} />
              </span>
            </span>
          </a>
        ))}
      </nav>
    </section>
  )
}

export default function AdminWorkspace({ Detail, initialTicket, currentPath }) {
  const toast = useToast()
  const activePath = currentPath || (typeof window !== 'undefined' ? window.location.pathname : '')
  const tab = getAdminTabFromPath(activePath, { hasInitialTicket: Boolean(initialTicket) }) || 'overview'
  const [selected, setSelected] = useState(initialTicket)
  const [adminMap, setAdminMap] = useState({})

  useEffect(() => {
    let active = true
    getAdminsList().then(admins => {
      if (active) setAdminMap(buildAdminMap(admins))
    })
    const onRefresh = () => {
      getAdminsList(true).then(admins => {
        if (active) setAdminMap(buildAdminMap(admins))
      })
    }
    window.addEventListener('admin:refresh', onRefresh)
    return () => {
      active = false
      window.removeEventListener('admin:refresh', onRefresh)
    }
  }, [])
  const setTab = useCallback(nextTab => {
    if (selected) setSelected(null)
    navigateAdmin(nextTab)
  }, [selected])

  // Filter & Search states
  const [filter, setFilter] = useState('all')
  const [batchFilter, setBatchFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  // Interactive sorting states
  const [sortField, setSortField] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  // Pagination & data states
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)

  // Delivery updates states
  const [emails, setEmails] = useState([])
  const [emailPage, setEmailPage] = useState(0)
  const [emailTotal, setEmailTotal] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [revision, setRevision] = useState(0)

  const searchInputRef = useRef(null)
  const requestSeqRef = useRef(0)

  const refresh = useCallback(() => setRevision(v => v + 1), [])

  // Debounced search input handler
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search)
      setPage(0)
    }, 280)
    return () => clearTimeout(timer)
  }, [search])

  // Global '/' keyboard shortcut to focus search input
  useEffect(() => {
    const onKeyDown = (e) => {
      if (tab !== 'tickets') return
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tab])

  const handleSort = useCallback((field) => {
    if (sortField === field) {
      setSortAsc(asc => !asc)
    } else {
      setSortField(field)
      const defaultAsc = ['full_name', 'reference', 'school_index_number', 'status'].includes(field)
      setSortAsc(defaultAsc)
    }
    setPage(0)
  }, [sortField])

  const sortSelectValue = useMemo(() => {
    if (sortField === 'created_at' && !sortAsc) return 'newest'
    if (sortField === 'created_at' && sortAsc) return 'oldest'
    if (sortField === 'full_name' && sortAsc) return 'name_asc'
    if (sortField === 'full_name' && !sortAsc) return 'name_desc'
    if (sortField === 'reference' && sortAsc) return 'ref_asc'
    if (sortField === 'reference' && !sortAsc) return 'ref_desc'
    if (sortField === 'school_joined_year' && !sortAsc) return 'batch_desc'
    if (sortField === 'school_joined_year' && sortAsc) return 'batch_asc'
    return 'custom'
  }, [sortField, sortAsc])

  const handleSortSelect = useCallback((val) => {
    if (val === 'newest') { setSortField('created_at'); setSortAsc(false) }
    else if (val === 'oldest') { setSortField('created_at'); setSortAsc(true) }
    else if (val === 'name_asc') { setSortField('full_name'); setSortAsc(true) }
    else if (val === 'name_desc') { setSortField('full_name'); setSortAsc(false) }
    else if (val === 'ref_asc') { setSortField('reference'); setSortAsc(true) }
    else if (val === 'ref_desc') { setSortField('reference'); setSortAsc(false) }
    else if (val === 'batch_desc') { setSortField('school_joined_year'); setSortAsc(false) }
    else if (val === 'batch_asc') { setSortField('school_joined_year'); setSortAsc(true) }
    setPage(0)
  }, [])

  const hasActiveFilters = filter !== 'all' || batchFilter !== 'all' || Boolean(query.trim())
  const resetFilters = useCallback(() => {
    setFilter('all')
    setBatchFilter('all')
    setSearch('')
    setQuery('')
    setSortField('created_at')
    setSortAsc(false)
    setPage(0)
  }, [])
  useEffect(() => { try { sessionStorage.removeItem('gh-scanned-ticket') } catch { /* optional */ } }, [])
  useEffect(() => {
    const handleRefresh = () => refresh()
    window.addEventListener('admin:refresh', handleRefresh)
    return () => window.removeEventListener('admin:refresh', handleRefresh)
  }, [refresh])
  useEffect(() => {
    const handleNewReceipt = (e) => {
      const { reservationId, fullName, reference } = e.detail || {}
      toast.show({
        status: 'info',
        title: `New receipt: ${fullName || 'Attendee'}`,
        description: `${reference || 'Ticket'} is ready for review. Click to inspect.`,
        duration: 8000,
        action: reservationId ? {
          label: 'Review',
          onClick: () => setSelected(reservationId)
        } : undefined
      })
    }
    window.addEventListener('admin:new-receipt', handleNewReceipt)
    return () => window.removeEventListener('admin:new-receipt', handleNewReceipt)
  }, [toast])
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
    const querySeq = ++requestSeqRef.current
    async function load() {
      setLoading(true); setError('')
      if (tab === 'updates') {
        const { data, error, count } = await supabase.from('notification_outbox').select('id,reservation_id,status,created_at,sent_at,attempts,reservations(reference,full_name)', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(emailPage * pageSize, (emailPage + 1) * pageSize - 1)
        if (!live || querySeq !== requestSeqRef.current) return
        if (error) throw error
        setEmails(data || []); setEmailTotal(count || 0)
      } else {
        let request = supabase.from('reservations').select(listFields, { count: 'exact' })
        if (filter !== 'all') request = request.eq('status', filter)
        if (batchFilter !== 'all') request = request.eq('school_joined_year', Number(batchFilter))

        // Strip PostgREST operators from free text; multi-field server-side search
        const term = query.replace(/[^\p{L}\p{N} -]/gu, '').trim().slice(0,80)
        if (term) {
          request = request.or(
            `full_name.ilike.%${term}%,reference.ilike.%${term}%,nic_number.ilike.%${term}%,school_index_number.ilike.%${term}%,whatsapp.ilike.%${term}%,email.ilike.%${term}%`
          )
        }

        request = request.order(sortField, { ascending: sortAsc, nullsFirst: false })
        if (sortField !== 'id') {
          request = request.order('id', { ascending: false })
        }

        const { data, error, count } = await request.range(page * pageSize, (page + 1) * pageSize - 1)
        if (!live || querySeq !== requestSeqRef.current) return
        if (error) throw error
        if (!data.length && page > 0) setPage(Math.max(0,Math.ceil(count / pageSize)-1))
        setRows(data || []); setTotal(count || 0)
      }
      setLoading(false)
    }
    load().catch(() => { if (live && querySeq === requestSeqRef.current) { setLoading(false); setError('Could not load the latest records. Refresh to try again.') } })
    return () => { live = false }
  }, [tab,filter,batchFilter,query,sortField,sortAsc,page,emailPage,revision])
  useEffect(() => {
    const tabName = tabs.find(t => t[0] === tab)?.[1]
    if (tabName) document.title = `${tabName} · Admin · Greens Heaven`
  }, [tab])
  function showTickets(status) { setFilter(status); setBatchFilter('all'); setPage(0); setTab('tickets'); setQuery(''); setSearch('') }
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
    <AdminNotificationBanner />
    {tab === 'overview' && summaryError && <p className="admin-error" role="alert">{summaryError}</p>}
    {tab === 'overview' && <FadeContent trigger="mount" duration={.18} className="stack">
      <section className="admin-overview-banner"><p className="admin-eyebrow">BEFORE THE DOORS OPEN</p><h2>Keep the evening<br /><em>moving.</em></h2><p>Review receipts, follow delivery and welcome your batch.</p><button className="admin-button primary" onClick={() => showTickets('pending_review')}>Review pending receipts<ChevronRight size={17} /></button></section>
      <section className="admin-stats" aria-label="Reservation totals">{stats.map(([key,label]) => <button key={key} className={`admin-stat-card ${key}`} onClick={() => showTickets(key)}><span>{label}</span><strong>{summary?.[key] ?? '—'}</strong><ChevronRight size={16} /></button>)}</section>
      <div className="admin-two-up">{[['entrance','Entrance desk','Admit confirmed guests',ScanLine],['photobooth','Photo booth desk','Check ID and record the session',Camera]].map(([key,title,copy,Icon]) => <button key={key} className="admin-panel admin-gate-shortcut" onClick={() => navigateAdmin(`/admin/dashboard/attendance/${key}`)}><Icon size={22} /><h3>{title}</h3><p>{copy}</p><strong>{summary?.[key] ?? '—'} recorded</strong></button>)}</div>
      <div className="admin-two-up">
        <button className="admin-panel admin-updates-shortcut" onClick={() => setTab('revenue')}>
          <CircleDollarSign size={21} className="text-[#7ce698]" />
          <span>
            <strong>Admin Revenue</strong>
            <small>{summary?.approved ? `Rs. ${(summary.approved * 6500).toLocaleString('en-LK')} confirmed proceeds` : 'Ticket proceeds & analytics'}</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button className="admin-panel admin-updates-shortcut" onClick={() => setTab('updates')}>
          <Bell size={21} />
          <span>
            <strong>Email delivery</strong>
            <small>{summary?.email_attention ?? '—'} waiting or needing attention</small>
          </span>
          <ChevronRight size={18} />
        </button>
      </div>
    </FadeContent>}
    {tab === 'tickets' && <section className="admin-panel stack">
      {/* Top Metric Cards matching Image 2 */}
      <div className="admin-metrics-grid" role="region" aria-label="Reservation metrics">
        <button
          type="button"
          className={`admin-metric-card all ${filter === 'all' && batchFilter === 'all' && !query ? 'active' : ''}`}
          onClick={() => { setFilter('all'); setBatchFilter('all'); setQuery(''); setSearch(''); setPage(0) }}
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
          className={`admin-metric-card pending_review ${filter === 'pending_review' ? 'active' : ''}`}
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
          className={`admin-metric-card approved ${filter === 'approved' ? 'active' : ''}`}
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
          className={`admin-metric-card awaiting_payment ${['awaiting_payment','rejected'].includes(filter) ? 'active' : ''}`}
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

      {/* Filter pills with live counts */}
      <div className="admin-pill-group" role="tablist" aria-label="Status filters">
        {[
          ['all', 'All', totalReservations || total],
          ['pending_review', 'Pending review', pendingCount],
          ['approved', 'Confirmed', approvedCount],
          ['awaiting_payment', 'Awaiting receipt', awaitingCount],
          ['rejected', 'Needs correction', rejectedCount],
        ].map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={`admin-filter-pill ${filter === key ? 'active' : ''}`}
            onClick={() => { setFilter(key); setPage(0) }}
          >
            <span>{label}</span>
            {count != null && <span className="admin-filter-pill-count">{count}</span>}
          </button>
        ))}
      </div>

      {/* Search & Controls Toolbar */}
      <div className="admin-table-toolbar">
        <form className="admin-toolbar-search" onSubmit={e => { e.preventDefault(); setQuery(search); setPage(0) }}>
          <Search size={16} className="admin-search-icon" aria-hidden="true" />
          <label htmlFor="admin-search" className="sr-only">Search members</label>
          <input
            ref={searchInputRef}
            id="admin-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            maxLength={80}
            placeholder="Search name, ID, phone..."
            autoComplete="off"
            spellCheck="false"
          />
          {search ? (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => { setSearch(''); setQuery(''); setPage(0); searchInputRef.current?.focus() }}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          ) : (
            <kbd className="admin-search-kbd" title="Press / to search">/</kbd>
          )}
        </form>

        <div className="admin-toolbar-controls">
          <div className="admin-select-wrap">
            <GraduationCap size={15} className="admin-select-icon" aria-hidden="true" />
            <select
              value={batchFilter}
              onChange={e => { setBatchFilter(e.target.value); setPage(0) }}
              aria-label="Filter by batch year"
              className="admin-select-input"
            >
              <option value="all">All batches</option>
              {BATCH_YEARS.map(year => (
                <option key={year} value={year}>Batch {year}</option>
              ))}
            </select>
            <ChevronDown size={13} className="admin-select-chevron" aria-hidden="true" />
          </div>

          <div className="admin-select-wrap">
            <ArrowUpDown size={14} className="admin-select-icon" aria-hidden="true" />
            <select
              value={sortSelectValue}
              onChange={e => handleSortSelect(e.target.value)}
              aria-label="Sort members"
              className="admin-select-input"
            >
              <option value="newest">Newest joined</option>
              <option value="oldest">Oldest joined</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
              <option value="ref_asc">Member ID (Asc)</option>
              <option value="ref_desc">Member ID (Desc)</option>
              <option value="batch_desc">Batch (Recent)</option>
              <option value="batch_asc">Batch (Oldest)</option>
              {sortSelectValue === 'custom' && <option value="custom">Custom column</option>}
            </select>
            <ChevronDown size={13} className="admin-select-chevron" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Active filters pill bar */}
      {hasActiveFilters && (
        <div className="admin-active-filters-bar">
          <div className="admin-active-tags">
            <span className="admin-active-label">Active filters:</span>
            {filter !== 'all' && (
              <span className="admin-active-tag">
                Status: {labels[filter] || filter}
                <button type="button" onClick={() => { setFilter('all'); setPage(0) }} aria-label="Remove status filter">
                  <X size={11} />
                </button>
              </span>
            )}
            {batchFilter !== 'all' && (
              <span className="admin-active-tag">
                Batch: {batchFilter}
                <button type="button" onClick={() => { setBatchFilter('all'); setPage(0) }} aria-label="Remove batch filter">
                  <X size={11} />
                </button>
              </span>
            )}
            {query.trim() && (
              <span className="admin-active-tag">
                Query: &ldquo;{query.trim()}&rdquo;
                <button type="button" onClick={() => { setSearch(''); setQuery(''); setPage(0) }} aria-label="Clear search query">
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <button type="button" className="admin-reset-all-btn" onClick={resetFilters}>
            <RotateCcw size={12} /> Reset all
          </button>
        </div>
      )}

      <div className="admin-table-count-label">
        {total} {total === 1 ? 'member' : 'members'}
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {loading ? (
        <div className="admin-empty"><Loader label="Loading reservations" /></div>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state">
          <p>
            No reservations match {query.trim() ? <span>for &ldquo;<strong>{query.trim()}</strong>&rdquo;</span> : 'your current filter criteria'}.
          </p>
          {hasActiveFilters && (
            <button type="button" className="admin-button" onClick={resetFilters}>
              <RotateCcw size={14} /> Clear search &amp; filters
            </button>
          )}
        </div>
      ) : (
        <div className="admin-members-table-wrap">
          <table className="admin-members-table">
            <thead>
              <tr>
                <th scope="col" aria-sort={sortField === 'full_name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => handleSort('full_name')}
                    className={`admin-th-btn ${sortField === 'full_name' ? 'active' : ''}`}
                    title="Sort by member name"
                  >
                    <span>Member</span>
                    <span className="admin-th-sort-icon" aria-hidden="true">
                      {sortField === 'full_name' ? (
                        sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                      ) : (
                        <ArrowUpDown size={12} className="admin-th-sort-neutral" />
                      )}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === 'reference' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => handleSort('reference')}
                    className={`admin-th-btn ${sortField === 'reference' ? 'active' : ''}`}
                    title="Sort by member reference ID"
                  >
                    <span>Member ID</span>
                    <span className="admin-th-sort-icon" aria-hidden="true">
                      {sortField === 'reference' ? (
                        sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                      ) : (
                        <ArrowUpDown size={12} className="admin-th-sort-neutral" />
                      )}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === 'school_index_number' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => handleSort('school_index_number')}
                    className={`admin-th-btn ${sortField === 'school_index_number' ? 'active' : ''}`}
                    title="Sort by admission number"
                  >
                    <span>Admission no.</span>
                    <span className="admin-th-sort-icon" aria-hidden="true">
                      {sortField === 'school_index_number' ? (
                        sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                      ) : (
                        <ArrowUpDown size={12} className="admin-th-sort-neutral" />
                      )}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === 'school_joined_year' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => handleSort('school_joined_year')}
                    className={`admin-th-btn ${sortField === 'school_joined_year' ? 'active' : ''}`}
                    title="Sort by batch year"
                  >
                    <span>Batch</span>
                    <span className="admin-th-sort-icon" aria-hidden="true">
                      {sortField === 'school_joined_year' ? (
                        sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                      ) : (
                        <ArrowUpDown size={12} className="admin-th-sort-neutral" />
                      )}
                    </span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === 'status' ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className={`admin-th-btn ${sortField === 'status' ? 'active' : ''}`}
                    title="Sort by status"
                  >
                    <span>Status</span>
                    <span className="admin-th-sort-icon" aria-hidden="true">
                      {sortField === 'status' ? (
                        sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                      ) : (
                        <ArrowUpDown size={12} className="admin-th-sort-neutral" />
                      )}
                    </span>
                  </button>
                </th>
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
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`admin-status-dot-badge ${row.status}`}>
                        <span className="admin-dot" />
                        <span>{labels[row.status] || row.status}</span>
                      </span>
                      {row.reviewed_by && (
                        <span className="text-[10px] text-[#7f997a] truncate max-w-[130px]" title={`Reviewed by ${adminMap[row.reviewed_by] || row.reviewed_by}`}>
                          by {(adminMap[row.reviewed_by] || 'admin').split('@')[0]}
                        </span>
                      )}
                    </div>
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
    {tab === 'attendance' && !getAdminGateFromPath(activePath) && <AttendanceGateChooser />}
    {tab === 'attendance' && getAdminGateFromPath(activePath) && (
      <GateDesk
        initialGate={getAdminGateFromPath(activePath)}
        lockedGate={getAdminGateFromPath(activePath)}
        adminMap={adminMap}
        onChange={refresh}
        onSelectTicket={setSelected}
      />
    )}
    {tab === 'arrivals' && (
      <AdminArrivals summary={summary} summaryError={summaryError} onSelectTicket={setSelected} />
    )}
    {tab === 'revenue' && (
      <AdminRevenueDashboard
        adminMap={adminMap}
        onSelectTicket={setSelected}
        onNavigateTab={setTab}
      />
    )}
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
    <AdminBottomNav
      tabs={tabs}
      activeTab={tab}
      onSelectTab={setTab}
      attentionCount={summary?.email_attention || 0}
    />
    <p className="admin-sync-note">Totals refresh every 30 seconds while this page is visible.</p>
  </div>
}

function Pagination({ page, total, busy, onPage }) {
  return <nav className="admin-pagination" aria-label="Results pages"><button className="admin-button" disabled={busy || page === 0} onClick={() => onPage(page-1)}>Previous</button><span>{page+1} / {Math.max(1,Math.ceil(total/pageSize))}</span><button className="admin-button" disabled={busy || (page+1)*pageSize >= total} onClick={() => onPage(page+1)}>Next</button></nav>
}
