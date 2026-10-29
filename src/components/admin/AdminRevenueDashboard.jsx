import { useEffect, useMemo, useState } from 'react'
import {
  TrendingUp,
  CircleDollarSign,
  Calendar,
  ShieldCheck,
  AlertCircle,
  ChevronRight,
  BarChart3,
  CreditCard,
  Search,
  X,
  Layers,
  Sparkles,
  RotateCcw,
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { formatMoney } from '../../lib/tickets.js'
import { getAdminDisplayName } from '../../lib/admins.js'
import { Loader } from '../motion/loader.jsx'
import FadeContent from '../FadeContent.jsx'

const TICKET_PRICE = 7000
const TOTAL_CAPACITY = 175
const VIP_DEDUCTION = 6500 + 6500 + 7000 + 7000


function getColomboDateKey(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' }) // YYYY-MM-DD
  } catch {
    return ''
  }
}

function formatDisplayDate(dateKey) {
  if (!dateKey) return 'Date unknown'
  try {
    const [y, m, d] = dateKey.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return dateKey
  }
}

function formatShortDate(dateKey) {
  if (!dateKey) return ''
  try {
    const [y, m, d] = dateKey.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  } catch {
    return dateKey
  }
}

function formatDayNum(dateKey) {
  if (!dateKey) return ''
  try {
    const [, , d] = dateKey.split('-').map(Number)
    return String(d)
  } catch {
    return dateKey
  }
}

function getReservationAmount(r) {
  const val = Number(r?.amount_lkr)
  if (val && !isNaN(val) && val > 0) return val
  return 6500 // Legacy default
}

function getReservationTier(r) {
  const amt = getReservationAmount(r)
  return amt >= 7000 ? 7000 : 6500
}

export default function AdminRevenueDashboard({ adminMap = {}, onSelectTicket, onNavigateTab }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeFilter, setTimeFilter] = useState('all') // 'all', '30d', '7d', 'today'
  const [tierFilter, setTierFilter] = useState('all') // 'all', '6500', '7000'
  const [selectedBatch, setSelectedBatch] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [chartMetric, setChartMetric] = useState('tickets') // 'tickets' | 'revenue'
  const [focusedDayKey, setFocusedDayKey] = useState(null)

  // Pure snapshot reference for date diffs
  const [referenceTime] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    supabase
      .from('reservations')
      .select('id, reference, full_name, email, status, amount_lkr, created_at, reviewed_at, reviewed_by, school_joined_year')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchErr }) => {
        if (!active) return
        if (fetchErr) setError(fetchErr.message || 'Could not load revenue data.')
        else setReservations(data || [])
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err?.message || 'Could not load revenue data.')
        setLoading(false)
      })

    const handleRefresh = () => {
      setLoading(true)
      setRevision((v) => v + 1)
    }
    window.addEventListener('admin:refresh', handleRefresh)
    return () => {
      active = false
      window.removeEventListener('admin:refresh', handleRefresh)
    }
  }, [revision])

  // Partition reservations
  const { approved, pending, awaiting } = useMemo(() => {
    const app = []
    const pen = []
    const awa = []
    for (const r of reservations) {
      if (r.status === 'approved') app.push(r)
      else if (r.status === 'pending_review') pen.push(r)
      else if (r.status === 'awaiting_payment') awa.push(r)
    }
    return { approved: app, pending: pen, awaiting: awa }
  }, [reservations])

  // Tier Breakdown Computations
  const tierStats = useMemo(() => {
    const approved6500 = approved.filter((r) => getReservationTier(r) === 6500)
    const approved7000 = approved.filter((r) => getReservationTier(r) === 7000)

    const gross6500 = approved6500.reduce((sum, r) => sum + getReservationAmount(r), 0)
    const net6500 = Math.max(0, gross6500 - VIP_DEDUCTION)

    const gross7000 = approved7000.reduce((sum, r) => sum + getReservationAmount(r), 0)
    const net7000 = gross7000

    const pending6500 = pending.filter((r) => getReservationTier(r) === 6500).length
    const pending7000 = pending.filter((r) => getReservationTier(r) === 7000).length

    const awaiting6500 = awaiting.filter((r) => getReservationTier(r) === 6500).length
    const awaiting7000 = awaiting.filter((r) => getReservationTier(r) === 7000).length

    const totalApproved = approved.length
    const pct6500 = Math.min(100, Math.round((approved6500.length / TOTAL_CAPACITY) * 100))
    const pct7000 = Math.min(100, Math.round((approved7000.length / TOTAL_CAPACITY) * 100))
    const ticketsRemaining = Math.max(0, TOTAL_CAPACITY - totalApproved)

    return {
      t6500: {
        count: approved6500.length,
        revenue: net6500,
        pending: pending6500,
        awaiting: awaiting6500,
        pct: pct6500,
        soldOut: approved6500.length > 0,
      },
      t7000: {
        count: approved7000.length,
        revenue: net7000,
        pending: pending7000,
        awaiting: awaiting7000,
        pct: pct7000,
        remaining: ticketsRemaining,
      },
      ticketsRemaining,
    }
  }, [approved, pending, awaiting])

  // Core Revenue Computations (dynamically reflects tierFilter when selected)
  const {
    activeApproved,
    activePending,
    activeAwaiting,
    confirmedRevenue,
    pendingRevenue,
    awaitingRevenue,
    totalProjectedGross,
    realizationRate,
  } = useMemo(() => {
    let app = approved
    let pen = pending
    let awa = awaiting

    if (tierFilter !== 'all') {
      const targetTier = Number(tierFilter)
      app = approved.filter((r) => getReservationTier(r) === targetTier)
      pen = pending.filter((r) => getReservationTier(r) === targetTier)
      awa = awaiting.filter((r) => getReservationTier(r) === targetTier)
    }

    const deduction = tierFilter === '7000' ? 0 : VIP_DEDUCTION

    const gross = app.reduce((sum, r) => sum + getReservationAmount(r), 0)
    const conf = Math.max(0, gross - deduction)

    const pend = pen.reduce((sum, r) => sum + (Number(r.amount_lkr) || TICKET_PRICE), 0)
    const awai = awa.reduce((sum, r) => sum + (Number(r.amount_lkr) || TICKET_PRICE), 0)

    const projected = app.length + pen.length + awa.length > 0 ? conf + pend + awai : 0
    const rate = projected > 0 ? Math.round((conf / projected) * 100) : 0

    return {
      activeApproved: app,
      activePending: pen,
      activeAwaiting: awa,
      confirmedRevenue: conf,
      pendingRevenue: pend,
      awaitingRevenue: awai,
      totalProjectedGross: projected,
      realizationRate: rate,
    }
  }, [approved, pending, awaiting, tierFilter])

  // Date-based Analytics & Groupings (reflects tierFilter)
  const todayKey = useMemo(() => getColomboDateKey(new Date(referenceTime).toISOString()), [referenceTime])

  const {
    dailyTimelineChronological,
    maxDayRevenue,
    maxDayCount,
    peakDay,
    avgTicketsPerDay,
  } = useMemo(() => {
    const map = new Map()

    for (const r of activeApproved) {
      const dateKey = getColomboDateKey(r.reviewed_at || r.created_at)
      if (!dateKey) continue
      const current = map.get(dateKey) || {
        dateKey,
        count: 0,
        revenue: 0,
        count6500: 0,
        count7000: 0,
      }
      const tier = getReservationTier(r)
      const amt = getReservationAmount(r)
      current.count += 1
      current.revenue += amt
      if (tier === 6500) current.count6500 += 1
      else current.count7000 += 1
      map.set(dateKey, current)
    }

    const sortedAsc = Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    let maxRev = 0
    let maxCnt = 0
    let peak = null
    const withCumulative = []
    let running = 0
    let totalCount = 0

    for (const day of sortedAsc) {
      running += day.revenue
      totalCount += day.count
      if (day.revenue > maxRev) maxRev = day.revenue
      if (day.count > maxCnt) {
        maxCnt = day.count
        peak = day
      }
      withCumulative.push({
        ...day,
        cumulativeRevenue: running,
        displayDate: formatDisplayDate(day.dateKey),
        shortDate: formatShortDate(day.dateKey),
        dayNum: formatDayNum(day.dateKey),
      })
    }

    return {
      dailyTimelineChronological: withCumulative,
      maxDayRevenue: maxRev || 1,
      maxDayCount: maxCnt || 1,
      peakDay: peak,
      avgTicketsPerDay: withCumulative.length > 0 ? (totalCount / withCumulative.length).toFixed(1) : '0',
    }
  }, [activeApproved])

  const activeFocusDay = useMemo(() => {
    if (dailyTimelineChronological.length === 0) return null
    if (focusedDayKey) {
      const found = dailyTimelineChronological.find((d) => d.dateKey === focusedDayKey)
      if (found) return found
    }
    const todayMatch = dailyTimelineChronological.find((d) => d.dateKey === todayKey)
    return todayMatch || dailyTimelineChronological[dailyTimelineChronological.length - 1]
  }, [dailyTimelineChronological, focusedDayKey, todayKey])

  // Batch Options for transaction filter
  const batchOptions = useMemo(() => {
    const counts = new Map()
    for (const r of approved) {
      const year = r.school_joined_year
      if (year) counts.set(year, (counts.get(year) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year)
  }, [approved])

  // Filtered transactions for the ledger
  const filteredApproved = useMemo(() => {
    let list = approved

    // Tier filter
    if (tierFilter !== 'all') {
      const targetTier = Number(tierFilter)
      list = list.filter((r) => getReservationTier(r) === targetTier)
    }

    // Batch filter
    if (selectedBatch !== 'all') {
      list = list.filter((r) => String(r.school_joined_year) === String(selectedBatch))
    }

    // Time filter
    if (timeFilter === 'today') {
      list = list.filter((r) => getColomboDateKey(r.reviewed_at || r.created_at) === todayKey)
    } else if (timeFilter === '7d') {
      const cutoff = new Date(referenceTime - 7 * 86400000).toISOString()
      list = list.filter((r) => (r.reviewed_at || r.created_at) >= cutoff)
    } else if (timeFilter === '30d') {
      const cutoff = new Date(referenceTime - 30 * 86400000).toISOString()
      list = list.filter((r) => (r.reviewed_at || r.created_at) >= cutoff)
    }

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((r) => {
        const name = (r.full_name || '').toLowerCase()
        const ref = (r.reference || '').toLowerCase()
        const email = (r.email || '').toLowerCase()
        return name.includes(q) || ref.includes(q) || email.includes(q)
      })
    }

    return list
  }, [approved, tierFilter, selectedBatch, timeFilter, searchQuery, todayKey, referenceTime])

  const isFiltering = tierFilter !== 'all' || selectedBatch !== 'all' || timeFilter !== 'all' || searchQuery.trim() !== ''

  const clearAllFilters = () => {
    setTierFilter('all')
    setSelectedBatch('all')
    setTimeFilter('all')
    setSearchQuery('')
  }

  return (
    <FadeContent trigger="mount" duration={0.18} className="admin-rev-dashboard stack font-sans">
      {error && <p className="admin-error" role="alert">{error}</p>}

      {loading && reservations.length === 0 ? (
        <div className="admin-empty">
          <Loader label="Loading ticket revenue…" />
        </div>
      ) : (
        <>
          {/* Active Tier Filter Banner */}
          {tierFilter !== 'all' && (
            <div className="flex items-center justify-between p-2 px-3 rounded-lg bg-[#0b1d10] border border-[#1f4728] text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                <span className="text-[#edf5ea] font-medium">Rs. {Number(tierFilter).toLocaleString()} filter</span>
                <span className="text-[#7ce698] font-semibold tabular-nums">({activeApproved.length} paid)</span>
              </div>
              <button
                type="button"
                onClick={() => setTierFilter('all')}
                className="text-[11px] font-medium text-[#86efac] hover:text-white bg-[#14331d] px-2 py-0.5 rounded border border-[#235630] transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}

          {/* Main 4-up Metrics Grid */}
          <div className="admin-rev-grid" role="region" aria-label="Revenue summary cards">
            {/* Confirmed Collected Revenue */}
            <div className="admin-rev-card confirmed">
              <div className="admin-rev-card-top">
                <div className="w-5 h-5 rounded-md bg-[#14361e] border border-[#2a683a] flex items-center justify-center text-[#7ce698]">
                  <CircleDollarSign size={12} />
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-[#183922] border border-[#2d6c3e] text-[9px] text-[#7ce698] font-semibold tabular-nums">
                  {activeApproved.length} Paid
                </span>
              </div>
              <div>
                <strong className="admin-rev-number text-[#7ce698] block">
                  {formatMoney(confirmedRevenue)}
                </strong>
                <span className="admin-rev-label block">Confirmed</span>
              </div>
            </div>

            {/* Pending In Review Pipeline */}
            <div
              className="admin-rev-card pending"
              onClick={() => onNavigateTab && onNavigateTab('tickets')}
              title="Click to view pending receipts"
              role="button"
              tabIndex={0}
            >
              <div className="admin-rev-card-top">
                <div className="w-5 h-5 rounded-md bg-[#2b1f0a] border border-[#5a3f12] flex items-center justify-center text-[#f59e0b]">
                  <AlertCircle size={12} />
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-[#342107] border border-[#6b450c] text-[9px] text-[#fbbf24] font-semibold tabular-nums">
                  {activePending.length} In Review
                </span>
              </div>
              <div>
                <strong className="admin-rev-number text-[#fbbf24] block">
                  {formatMoney(pendingRevenue)}
                </strong>
                <span className="admin-rev-label block text-[#e2b668]">In Review</span>
              </div>
            </div>

            {/* Awaiting Payment Pipeline */}
            <div className="admin-rev-card awaiting">
              <div className="admin-rev-card-top">
                <div className="w-5 h-5 rounded-md bg-[#0d2840] border border-[#1b4b73] flex items-center justify-center text-[#38bdf8]">
                  <CreditCard size={12} />
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-[#0d2840] border border-[#1d4c75] text-[9px] text-[#7dd3fc] font-semibold tabular-nums">
                  {activeAwaiting.length} Reserved
                </span>
              </div>
              <div>
                <strong className="admin-rev-number text-[#7dd3fc] block">
                  {formatMoney(awaitingRevenue)}
                </strong>
                <span className="admin-rev-label block text-[#93c5fd]">Awaiting Slip</span>
              </div>
            </div>

            {/* Realization Rate / Projected Gross */}
            <div className="admin-rev-card gross">
              <div className="admin-rev-card-top">
                <div className="w-5 h-5 rounded-md bg-[#142818] border border-[#2b4c2f] flex items-center justify-center text-[#a4cca0]">
                  <TrendingUp size={12} />
                </div>
                <span className="px-1.5 py-0.2 rounded-full bg-[#18281a] border border-[#2b4c2f] text-[9px] text-[#c2dfbd] font-semibold tabular-nums">
                  {realizationRate}% Realized
                </span>
              </div>
              <div>
                <strong className="admin-rev-number text-[#edf5ea] block">
                  {formatMoney(totalProjectedGross)}
                </strong>
                <span className="admin-rev-label block">Gross Potential</span>
              </div>
            </div>
          </div>

          {/* TIER BREAKDOWN SECTION: Clean, Compact, Sans-Serif */}
          <section className="admin-panel stack" aria-label="Ticket pricing tiers">
            <div className="flex items-center justify-between gap-2 border-b border-[#182f1d] pb-2">
              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-[#7ce698]" />
                <span className="admin-rev-title text-xs font-semibold text-[#edf5ea]">Pricing Tiers</span>
                <span className="text-[11px] text-[#728c6e] tabular-nums">
                  ({tierStats.ticketsRemaining > 0 ? `${tierStats.ticketsRemaining} left` : 'Sold out'})
                </span>
              </div>

              {/* Segmented Filter Pills */}
              <div className="inline-flex items-center bg-[#07130a] p-0.5 rounded-lg border border-[#1a3822] text-[11px]">
                <button
                  type="button"
                  onClick={() => setTierFilter('all')}
                  className={`px-2 py-0.5 rounded transition-all font-medium cursor-pointer ${
                    tierFilter === 'all'
                      ? 'bg-[#163821] text-[#7ce698]'
                      : 'text-[#7e997d] hover:text-[#edf5ea]'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter(tierFilter === '6500' ? 'all' : '6500')}
                  className={`px-2 py-0.5 rounded transition-all font-medium cursor-pointer ${
                    tierFilter === '6500'
                      ? 'bg-[#163821] text-[#7ce698]'
                      : 'text-[#7e997d] hover:text-[#edf5ea]'
                  }`}
                >
                  6.5k
                </button>
                <button
                  type="button"
                  onClick={() => setTierFilter(tierFilter === '7000' ? 'all' : '7000')}
                  className={`px-2 py-0.5 rounded transition-all font-medium cursor-pointer ${
                    tierFilter === '7000'
                      ? 'bg-[#163821] text-[#7ce698]'
                      : 'text-[#7e997d] hover:text-[#edf5ea]'
                  }`}
                >
                  7k
                </button>
              </div>
            </div>

            {/* Two Tier Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
              {/* Rs. 6,500 Tier */}
              <div
                onClick={() => setTierFilter(tierFilter === '6500' ? 'all' : '6500')}
                className={`admin-tier-card p-2.5 sm:p-3 rounded-xl border flex flex-col justify-between gap-1.5 cursor-pointer transition-all ${
                  tierFilter === '6500'
                    ? 'bg-[#132818] border-[#4ade80] ring-1 ring-[#4ade80]/40'
                    : 'bg-[#08150c] border-[#1b3422] hover:border-[#2a5435]'
                }`}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#8ca889]">Tier 1</span>
                    <strong className="text-xs font-semibold text-[#edf5ea]">Rs. 6,500</strong>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#2a1d08] text-[#fbbf24] border border-[#5c3e10]">
                    Sold Out
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1 pb-1 border-y border-[#152e1b]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold text-[#edf5ea] tabular-nums">
                      {tierStats.t6500.count}
                    </span>
                    <span className="text-[10px] text-[#7f997a]">tickets</span>
                  </div>
                  <strong className="text-xs font-bold text-[#7ce698] tabular-nums">
                    {formatMoney(tierStats.t6500.revenue)}
                  </strong>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#7f997a]">
                  <span>120 / 120 sold</span>
                  <span className="text-[#7ce698] text-[10px] font-medium flex items-center gap-0.5">
                    {tierFilter === '6500' ? 'Filtered' : 'Filter'}
                    <ChevronRight size={10} />
                  </span>
                </div>
              </div>

              {/* Rs. 7,000 Tier */}
              <div
                onClick={() => setTierFilter(tierFilter === '7000' ? 'all' : '7000')}
                className={`admin-tier-card p-2.5 sm:p-3 rounded-xl border flex flex-col justify-between gap-1.5 cursor-pointer transition-all ${
                  tierFilter === '7000'
                    ? 'bg-[#132818] border-[#4ade80] ring-1 ring-[#4ade80]/40'
                    : 'bg-[#08150c] border-[#1b3422] hover:border-[#2a5435]'
                }`}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[#7ce698]">Tier 2</span>
                    <strong className="text-xs font-semibold text-[#edf5ea]">Rs. 7,000</strong>
                    <Sparkles size={11} className="text-[#7ce698]" />
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#102b17] text-[#7ce698] border border-[#21572e]">
                    25 Left
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1 pb-1 border-y border-[#152e1b]">
                  <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold text-[#edf5ea] tabular-nums">
                      {tierStats.t7000.count}
                    </span>
                    <span className="text-[10px] text-[#7f997a]">tickets</span>
                  </div>
                  <strong className="text-xs font-bold text-[#7ce698] tabular-nums">
                    {formatMoney(tierStats.t7000.revenue)}
                  </strong>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#7f997a]">
                  <span>25 remaining</span>
                  <span className="text-[#7ce698] text-[10px] font-medium flex items-center gap-0.5">
                    {tierFilter === '7000' ? 'Filtered' : 'Filter'}
                    <ChevronRight size={10} />
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Date-Based Timeline & Daily Intake Visualizer */}
          <section className="admin-panel stack">
            <div className="flex items-center justify-between gap-2 border-b border-[#182f1d] pb-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 size={14} className="text-[#7ce698]" />
                <span className="admin-rev-title text-xs font-semibold text-[#edf5ea]">Daily Intake</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex items-center bg-[#07130a] p-0.5 rounded-lg border border-[#1a3822] text-[11px]">
                  <button
                    type="button"
                    onClick={() => setChartMetric('tickets')}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                      chartMetric === 'tickets'
                        ? 'bg-[#163821] text-[#7ce698] shadow-xs'
                        : 'text-[#7e997d] hover:text-[#edf5ea]'
                    }`}
                  >
                    Tickets
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('revenue')}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
                      chartMetric === 'revenue'
                        ? 'bg-[#163821] text-[#7ce698] shadow-xs'
                        : 'text-[#7e997d] hover:text-[#edf5ea]'
                    }`}
                  >
                    Revenue
                  </button>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[#7ce698] bg-[#0d2213] border border-[#1f4728] px-2 py-0.5 rounded-md hidden sm:inline-block">
                  Total: {formatMoney(confirmedRevenue)}
                </span>
              </div>
            </div>

            {dailyTimelineChronological.length === 0 ? (
              <p className="admin-empty">No confirmed revenue recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-3 pt-1">
                {/* Active / Hovered Day Spotlight Strip */}
                {activeFocusDay && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3 rounded-xl bg-[#08150c] border border-[#193822] text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 font-medium text-[#edf5ea]">
                        <Calendar size={13} className="text-[#7ce698]" />
                        <span>{activeFocusDay.displayDate}</span>
                      </div>
                      {activeFocusDay.dateKey === todayKey && (
                        <span className="px-1.5 py-0.2 rounded bg-[#163821] text-[9px] text-[#7ce698] font-bold tracking-wider">
                          TODAY
                        </span>
                      )}
                      {activeFocusDay.dateKey === peakDay?.dateKey && (
                        <span className="px-1.5 py-0.2 rounded bg-[#2b2710] border border-[#6b5820] text-[9px] text-[#f4d068] font-medium flex items-center gap-1">
                          <Sparkles size={9} /> PEAK
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-3">
                      {/* Tier Breakdown Badges */}
                      <div className="flex items-center gap-1 text-[10px]">
                        {activeFocusDay.count6500 > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[#102315] border border-[#1e4629] text-[#a4cca0] font-semibold tabular-nums">
                            {activeFocusDay.count6500} × 6.5k
                          </span>
                        )}
                        {activeFocusDay.count7000 > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[#163821] border border-[#2b643a] text-[#7ce698] font-semibold tabular-nums">
                            {activeFocusDay.count7000} × 7k
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 border-l border-[#193520] pl-2 sm:pl-3">
                        <span className="text-[#8ba486] text-[11px]">
                          {activeFocusDay.count} {activeFocusDay.count === 1 ? 'ticket' : 'tickets'}
                        </span>
                        <strong className="text-[#7ce698] font-bold tabular-nums text-xs sm:text-sm">
                          +{formatMoney(activeFocusDay.revenue)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* The Bar Chart Plot */}
                <div className="relative pt-6 pb-2 rounded-xl bg-[#061208]/60 border border-[#142918] p-3 sm:p-4 overflow-hidden">
                  {/* Dotted horizontal guideline grid */}
                  <div className="absolute inset-x-3 sm:inset-x-4 top-8 bottom-12 flex flex-col justify-between pointer-events-none opacity-45">
                    <div className="border-b border-dashed border-[#1f4728] w-full flex items-center justify-end pr-1">
                      <span className="text-[9px] tabular-nums text-[#5d8361] -translate-y-2">
                        {chartMetric === 'tickets' ? `${maxDayCount} tix` : formatMoney(maxDayRevenue)}
                      </span>
                    </div>
                    <div className="border-b border-dashed border-[#1b3b22] w-full flex items-center justify-end pr-1">
                      <span className="text-[9px] tabular-nums text-[#47664b] -translate-y-2">
                        {chartMetric === 'tickets' ? `${Math.round(maxDayCount / 2)}` : formatMoney(Math.round(maxDayRevenue / 2))}
                      </span>
                    </div>
                    <div className="border-b border-[#182f1d] w-full" />
                  </div>

                  {/* Columns flex container */}
                  <div className="relative z-10 flex items-end justify-between gap-1 sm:gap-2 h-44 sm:h-48 overflow-x-auto no-scrollbar pt-4">
                    {dailyTimelineChronological.map((day) => {
                      const isFocused = activeFocusDay?.dateKey === day.dateKey
                      const isToday = day.dateKey === todayKey
                      const isPeak = day.dateKey === peakDay?.dateKey

                      const totalVal = chartMetric === 'tickets' ? day.count : day.revenue
                      const maxVal = chartMetric === 'tickets' ? maxDayCount : maxDayRevenue
                      const heightPercent = Math.max(6, Math.min(100, Math.round((totalVal / maxVal) * 100)))

                      const countTotal = day.count || 1
                      const pct6500 = (day.count6500 / countTotal) * 100
                      const pct7000 = (day.count7000 / countTotal) * 100

                      return (
                        <div
                          key={day.dateKey}
                          onClick={() => setFocusedDayKey(day.dateKey)}
                          onMouseEnter={() => setFocusedDayKey(day.dateKey)}
                          className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative min-w-[22px] max-w-[56px]"
                        >
                          {/* Value pill on hover/focus */}
                          <div
                            className={`absolute -top-5 whitespace-nowrap text-[9px] font-semibold tabular-nums px-1.5 py-0.5 rounded transition-all pointer-events-none z-20 ${
                              isFocused
                                ? 'bg-[#163821] text-[#7ce698] border border-[#2d683d] scale-100 opacity-100 shadow-md'
                                : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 bg-[#0d2012] text-[#d4e5ce]'
                            }`}
                          >
                            {chartMetric === 'tickets' ? `${day.count}` : formatMoney(day.revenue)}
                          </div>

                          {/* Outer Column Track */}
                          <div
                            className={`w-full rounded-t-md relative flex flex-col justify-end overflow-hidden transition-all duration-200 ${
                              isFocused
                                ? 'ring-1 ring-[#5bb974] bg-[#0f2817]/70'
                                : 'bg-[#0b1c10]/40 hover:bg-[#0e2415]/60'
                            }`}
                            style={{ height: `${heightPercent}%` }}
                          >
                            {/* 7000 Tier segment (top) */}
                            {pct7000 > 0 && (
                              <div
                                style={{ height: `${pct7000}%` }}
                                className={`w-full transition-colors ${
                                  isFocused ? 'bg-[#86efac]' : 'bg-[#7ce698] group-hover:bg-[#86efac]'
                                }`}
                                title={`7,000 Tier: ${day.count7000}`}
                              />
                            )}
                            {/* 6500 Tier segment (bottom) */}
                            {pct6500 > 0 && (
                              <div
                                style={{ height: `${pct6500}%` }}
                                className={`w-full transition-colors ${
                                  isFocused ? 'bg-[#2b6d3b]' : 'bg-[#21562e] group-hover:bg-[#2b6d3b]'
                                }`}
                                title={`6,500 Tier: ${day.count6500}`}
                              />
                            )}
                          </div>

                          {/* X-Axis Day Label */}
                          <div className="pt-2 flex flex-col items-center gap-0.5 w-full">
                            <span
                              className={`text-[10px] font-semibold tabular-nums transition-colors block text-center truncate ${
                                isFocused
                                  ? 'text-[#7ce698] font-bold'
                                  : isToday
                                  ? 'text-[#86efac] font-semibold'
                                  : 'text-[#6b8568] group-hover:text-[#a0c29c]'
                              }`}
                            >
                              {day.dayNum}
                            </span>
                            {isToday ? (
                              <span className="w-1 h-1 rounded-full bg-[#7ce698] animate-pulse" />
                            ) : isPeak ? (
                              <span className="w-1 h-1 rounded-full bg-[#f4d068]" />
                            ) : (
                              <span className="w-1 h-1" />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Footer Legend & Summary Stats */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 px-1 text-[11px] text-[#7f997a]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#7ce698]" />
                      <span className="text-[#a8c7a4]">Rs. 7,000 Tier</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#21562e]" />
                      <span className="text-[#a8c7a4]">Rs. 6,500 Tier</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 tabular-nums text-[10px]">
                    {peakDay && (
                      <span className="text-[#99bca0]">
                        Peak: <strong className="text-[#edf5ea]">{peakDay.count} tix</strong> ({peakDay.shortDate})
                      </span>
                    )}
                    <span className="text-[#99bca0]">
                      Avg: <strong className="text-[#edf5ea]">{avgTicketsPerDay}</strong> / day
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Confirmed Transactions Stream & Enhanced Filter Bar */}
          <section className="admin-panel stack">
            <div className="flex flex-col gap-2 border-b border-[#182f1d] pb-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[#7ce698]" />
                  <span className="admin-rev-title text-xs font-semibold text-[#edf5ea]">Confirmed Transactions</span>
                  <span className="text-[11px] text-[#7f997a] tabular-nums font-normal">
                    ({filteredApproved.length})
                  </span>
                </div>

                {isFiltering && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-[#fbbf24] bg-[#291b07] border border-[#5a3a0e] hover:bg-[#3d270a] transition-colors touch-manipulation active:scale-[0.96]"
                  >
                    <RotateCcw size={12} />
                    <span>Reset filters</span>
                  </button>
                )}
              </div>

              {/* Toolbar Controls */}
              <div className="admin-rev-toolbar">
                {/* Top Row: Search Input + Batch Select */}
                <div className="admin-rev-toolbar-top">
                  <div className="admin-rev-search-wrap">
                    <Search size={15} className="admin-rev-search-icon" aria-hidden="true" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search attendee, GH-xxx, email…"
                      autoComplete="off"
                      spellCheck="false"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="admin-rev-search-clear"
                        aria-label="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {batchOptions.length > 0 && (
                    <select
                      value={selectedBatch}
                      onChange={(e) => setSelectedBatch(e.target.value)}
                      className="admin-rev-batch-select"
                    >
                      <option value="all">All batches</option>
                      {batchOptions.map((b) => (
                        <option key={b.year} value={b.year}>
                          Batch {b.year} ({b.count})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Bottom Row: Tier Filter Pills + Time Filter Pills */}
                <div className="admin-rev-toolbar-bottom">
                  {/* Tier Filter Tabs */}
                  <div className="admin-rev-pill-group">
                    {[
                      ['all', `All Tiers (${approved.length})`],
                      ['6500', `Rs. 6.5k (${tierStats.t6500.count})`],
                      ['7000', `Rs. 7k (${tierStats.t7000.count})`],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTierFilter(val)}
                        className={`admin-rev-pill-btn ${tierFilter === val ? 'active' : ''}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* Time Filter Pills */}
                  <div className="admin-rev-pill-group">
                    {[
                      ['all', 'All Time'],
                      ['30d', '30d'],
                      ['7d', '7d'],
                      ['today', 'Today'],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTimeFilter(val)}
                        className={`admin-rev-pill-btn ${timeFilter === val ? 'active' : ''}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {filteredApproved.length === 0 ? (
              <div className="admin-empty flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs text-[#7f997a] m-0">No confirmed transactions found matching criteria.</p>
                {isFiltering && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="mt-2 text-xs text-[#7ce698] hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-rev-list space-y-1.5 pt-1">
                {filteredApproved.map((r) => {
                  const reviewerName = getAdminDisplayName(r.reviewed_by, adminMap)
                  const tier = getReservationTier(r)
                  const amount = getReservationAmount(r)
                  const dateStr = r.reviewed_at || r.created_at
                  const formattedTime = dateStr
                    ? new Date(dateStr).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Colombo',
                      })
                    : '—'

                  return (
                    <div
                      key={r.id}
                      onClick={() => onSelectTicket && onSelectTicket(r.id)}
                      className="p-3 rounded-xl bg-[#07130b] border border-[#193320] flex items-center justify-between gap-3 hover:border-[#2e5938] transition-colors cursor-pointer touch-manipulation active:scale-[0.99] select-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Tier indicator badge */}
                        <div
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center font-bold text-[10px] tabular-nums shrink-0 ${
                            tier === 7000
                              ? 'bg-[#13301a] border-[#2b683a] text-[#7ce698]'
                              : 'bg-[#122316] border-[#1d4327] text-[#a4cca0]'
                          }`}
                          title={`Tier: Rs. ${tier.toLocaleString()}`}
                        >
                          {tier === 7000 ? '7k' : '6.5k'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <strong className="text-xs font-semibold text-[#edf5ea] truncate">
                              {r.full_name || 'Confirmed attendee'}
                            </strong>
                            <span className="text-[10px] font-semibold tabular-nums text-[#7ce698] bg-[#0c2012] px-1.5 py-0.2 rounded border border-[#1a4426] shrink-0">
                              {r.reference}
                            </span>
                            {tier === 7000 && (
                              <span className="hidden sm:inline px-1.5 py-0.2 rounded text-[8px] font-semibold bg-[#122b18] text-[#86efac] border border-[#1d4f2b]">
                                Phase 2
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-[#7f997a] mt-0.5 truncate">
                            <span>{formattedTime}</span>
                            {r.school_joined_year && (
                              <span>· Batch {r.school_joined_year}</span>
                            )}
                            {reviewerName && (
                              <span className="text-[#648460]">· by {reviewerName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        <strong className="text-xs font-bold tabular-nums text-[#7ce698]">
                          {formatMoney(amount)}
                        </strong>
                        <ChevronRight size={14} className="text-[#4e6b4a]" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </FadeContent>
  )
}
