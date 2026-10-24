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
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { formatMoney } from '../../lib/tickets.js'
import { getAdminDisplayName } from '../../lib/admins.js'
import { Loader } from '../motion/loader.jsx'
import FadeContent from '../FadeContent.jsx'

const TICKET_PRICE = 6500
const EVENT_DATE = new Date('2026-10-31T17:30:00+05:30')

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

export default function AdminRevenueDashboard({ adminMap = {}, onSelectTicket, onNavigateTab }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeFilter, setTimeFilter] = useState('all') // 'all', '30d', '7d', 'today'
  const [selectedBatch, setSelectedBatch] = useState('all')
  const [revision, setRevision] = useState(0)

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

  // Days until Solis Hotel event
  const daysUntilEvent = useMemo(() => {
    const diffTime = EVENT_DATE.getTime() - referenceTime
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
  }, [referenceTime])

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

  // Core Revenue Computations (based on derived 6,500 LKR ticket price)
  const VIP = 6500 * 1
  const confirmedRevenue = approved.length * TICKET_PRICE - VIP
  const pendingRevenue = pending.length * TICKET_PRICE
  const awaitingRevenue = awaiting.length * TICKET_PRICE
  const totalProjectedGross = (approved.length + pending.length + awaiting.length) * TICKET_PRICE - VIP
  const realizationRate = totalProjectedGross > 0 ? Math.round((confirmedRevenue / totalProjectedGross) * 100) : 0

  // Date-based Analytics & Groupings
  const todayKey = useMemo(() => getColomboDateKey(new Date(referenceTime).toISOString()), [referenceTime])
  const yesterdayKey = useMemo(() => getColomboDateKey(new Date(referenceTime - 86400000).toISOString()), [referenceTime])

  const { dailyTimeline, todayRevenue, yesterdayRevenue } = useMemo(() => {
    const map = new Map()

    for (const r of approved) {
      const dateKey = getColomboDateKey(r.reviewed_at || r.created_at)
      if (!dateKey) continue
      const current = map.get(dateKey) || { dateKey, count: 0, revenue: 0 }
      current.count += 1
      current.revenue += Number(r.amount_lkr) || TICKET_PRICE
      map.set(dateKey, current)
    }

    const sortedAsc = Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    const withCumulative = []
    let running = 0
    for (const day of sortedAsc) {
      running += day.revenue
      withCumulative.push({
        ...day,
        cumulativeRevenue: running,
        displayDate: formatDisplayDate(day.dateKey),
      })
    }

    const todayEntry = map.get(todayKey)
    const yesterdayEntry = map.get(yesterdayKey)

    return {
      dailyTimeline: withCumulative,
      todayRevenue: todayEntry ? todayEntry.revenue : 0,
      yesterdayRevenue: yesterdayEntry ? yesterdayEntry.revenue : 0,
    }
  }, [approved, todayKey, yesterdayKey])

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
    if (selectedBatch !== 'all') {
      list = list.filter((r) => String(r.school_joined_year) === String(selectedBatch))
    }
    if (timeFilter === 'today') {
      list = list.filter((r) => getColomboDateKey(r.reviewed_at || r.created_at) === todayKey)
    } else if (timeFilter === '7d') {
      const cutoff = new Date(referenceTime - 7 * 86400000).toISOString()
      list = list.filter((r) => (r.reviewed_at || r.created_at) >= cutoff)
    } else if (timeFilter === '30d') {
      const cutoff = new Date(referenceTime - 30 * 86400000).toISOString()
      list = list.filter((r) => (r.reviewed_at || r.created_at) >= cutoff)
    }
    return list
  }, [approved, selectedBatch, timeFilter, todayKey, referenceTime])

  return (
    <FadeContent trigger="mount" duration={0.18} className="stack">
    

      {error && <p className="admin-error" role="alert">{error}</p>}

      {loading && reservations.length === 0 ? (
        <div className="admin-empty">
          <Loader label="Loading ticket revenue…" />
        </div>
      ) : (
        <>
          {/* Main 4-up Metrics Grid - Compact, Sleek, Low Height */}
          <div className="admin-metrics-grid admin-revenue-metrics" role="region" aria-label="Revenue summary cards">
            {/* Confirmed Collected Revenue */}
            <div className="admin-metric-card all active">
              <div className="admin-metric-card-top">
                <CircleDollarSign size={16} className="text-[#7ce698]" />
                <span className="px-1.5 py-0.2 rounded-full bg-[#183922] border border-[#2d6c3e] text-[10px] text-[#7ce698] font-semibold">
                  {approved.length} Paid
                </span>
              </div>
              <strong className="admin-metric-number text-[#7ce698]!">
                {formatMoney(confirmedRevenue)}
              </strong>
              <span className="admin-metric-label">Confirmed</span>
              <span className="admin-metric-sub">
                100% verified & approved
              </span>
            </div>

            {/* Pending In Review Pipeline */}
            <div
              className="admin-metric-card pending_review cursor-pointer"
              onClick={() => onNavigateTab && onNavigateTab('tickets')}
              title="Click to view pending receipts"
            >
              <div className="admin-metric-card-top">
                <AlertCircle size={16} className="text-[#f59e0b]" />
                <span className="px-1.5 py-0.2 rounded-full bg-[#342107] border border-[#6b450c] text-[10px] text-[#fbbf24] font-semibold">
                  {pending.length} In Review
                </span>
              </div>
              <strong className="admin-metric-number text-[#fbbf24]">
                {formatMoney(pendingRevenue)}
              </strong>
              <span className="admin-metric-label">In Review</span>
              <span className="admin-metric-sub flex items-center gap-0.5 text-[#cca15c]">
                <span>Needs approval</span>
              </span>
            </div>

            {/* Awaiting Payment Pipeline */}
            <div className="admin-metric-card awaiting_payment">
              <div className="admin-metric-card-top">
                <CreditCard size={16} className="text-[#38bdf8]" />
                <span className="px-1.5 py-0.2 rounded-full bg-[#0d2840] border border-[#1d4c75] text-[10px] text-[#7dd3fc] font-semibold">
                  {awaiting.length} Reserved
                </span>
              </div>
              <strong className="admin-metric-number text-[#7dd3fc]">
                {formatMoney(awaitingRevenue)}
              </strong>
              <span className="admin-metric-label">Awaiting Slip</span>
              <span className="admin-metric-sub">
                Receipts pending
              </span>
            </div>

            {/* Realization Rate / Projected Gross */}
            <div className="admin-metric-card">
              <div className="admin-metric-card-top">
                <TrendingUp size={16} className="text-[#a4cca0]" />
                <span className="px-1.5 py-0.2 rounded-full bg-[#18281a] border border-[#2b4c2f] text-[10px] text-[#c2dfbd] font-semibold">
                  {realizationRate}% Realized
                </span>
              </div>
              <strong className="admin-metric-number text-[#edf5ea]">
                {formatMoney(totalProjectedGross)}
              </strong>
              <span className="admin-metric-label">Gross Potential</span>
              <span className="admin-metric-sub">
                {approved.length + pending.length + awaiting.length} attendees
              </span>
            </div>
          </div>

          {/* Secondary Stats Row: Today vs Yesterday + Days to Event in Compact Strip */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 sm:p-2.5 rounded-xl bg-[#08150c] border border-[#1b3422] flex flex-col justify-between">
              <span className="text-[10px] text-[#7f997a] font-medium block truncate">Today</span>
              <strong className="text-xs sm:text-sm font-semibold font-mono text-[#7ce698] mt-0.5 block truncate">
                {formatMoney(todayRevenue)}
              </strong>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-[#08150c] border border-[#1b3422] flex flex-col justify-between">
              <span className="text-[10px] text-[#7f997a] font-medium block truncate">Yesterday</span>
              <strong className="text-xs sm:text-sm font-semibold font-mono text-[#d8e5cd] mt-0.5 block truncate">
                {formatMoney(yesterdayRevenue)}
              </strong>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-[#08150c] border border-[#1b3422] flex flex-col justify-between">
              <span className="text-[10px] text-[#7f997a] font-medium block truncate">Event in</span>
              <strong className="text-xs sm:text-sm font-semibold font-mono text-[#86efac] mt-0.5 block truncate">
                {daysUntilEvent} days
              </strong>
            </div>
          </div>

          {/* Date-Based Timeline & Daily Intake Visualizer */}
          <section className="admin-panel stack">
            <div className="flex items-center justify-between gap-2 border-b border-[#182f1d] pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#edf5ea] m-0 flex items-center gap-1.5">
                  <BarChart3 size={15} className="text-[#7ce698]" />
                  <span>Daily Intake</span>
                </h3>
                <span className="text-[11px] text-[#7f997a] mt-0.5 block">
                  Accepted tickets by date
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#7ce698] bg-[#0d2213] border border-[#1f4728] px-2 py-0.5 rounded-md">
                Total: {formatMoney(confirmedRevenue)}
              </span>
            </div>

            {dailyTimeline.length === 0 ? (
              <p className="admin-empty">No confirmed revenue recorded yet.</p>
            ) : (
              <div className="space-y-2 pt-1">
                {dailyTimeline.map((day) => {
                  return (
                    <div
                      key={day.dateKey}
                      className="p-2.5 rounded-xl bg-[#31343211] border border-[#193320] flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5 font-medium text-[#edf5ea]">
                          <Calendar size={12} className="text-[#5f7f5a]" />
                          <span>{day.displayDate}</span>
                          {day.dateKey === todayKey && (
                            <span className="px-1.5 py-0.2 rounded bg-[#163821] text-[9px] text-[#7ce698] font-bold">
                              TODAY
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#8ba486] text-[10px]">
                            {day.count} {day.count === 1 ? 'ticket' : 'tickets'}
                          </span>
                          <strong className="text-[#7ce698] font-semibold text-xs font-mono">
                            +{formatMoney(day.revenue)}
                          </strong>
                        </div>
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Recent Confirmed Transactions Stream */}
          <section className="admin-panel stack">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#182f1d] pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#edf5ea] m-0 flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-[#7ce698]" />
                  <span>Confirmed Transactions</span>
                </h3>
                <span className="text-[11px] text-[#7f997a] mt-0.5 block">
                  {filteredApproved.length} approved tickets
                </span>
              </div>

              {/* Filters: Batch selector + Time Filter Pills */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
                {batchOptions.length > 0 && (
                  <select
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    className="bg-[#09150d] text-[#869f82] border border-[#1b3422] rounded-lg px-2 py-0.5 text-[11px] outline-none transition-colors"
                  >
                    <option value="all">All batches</option>
                    {batchOptions.map((b) => (
                      <option key={b.year} value={b.year}>
                        Batch {b.year} ({b.count})
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-1">
                  {[
                    ['all', 'All'],
                    ['30d', '30d'],
                    ['7d', '7d'],
                    ['today', 'Today'],
                  ].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTimeFilter(val)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition-colors touch-manipulation select-none active:scale-[0.96] ${
                        timeFilter === val
                          ? 'bg-[#183a21] text-[#7ce698] border border-[#2b643a]'
                          : 'bg-[#09150d] text-[#869f82] border border-[#1b3422] hover:text-[#d0e0cb]'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredApproved.length === 0 ? (
              <p className="admin-empty">No confirmed transactions found for this selection.</p>
            ) : (
              <div className="space-y-1.5 pt-1">
                {filteredApproved.slice(0, 30).map((r) => {
                  const reviewerName = getAdminDisplayName(r.reviewed_by, adminMap)
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
                      className="p-2.5 rounded-xl bg-[#07130b] border border-[#193320] flex items-center justify-between gap-2.5 hover:border-[#2e5938] transition-colors cursor-pointer touch-manipulation active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-[#112818] border border-[#214c2b] text-[#7ce698] flex items-center justify-center font-bold text-[11px] shrink-0">
                          Rs
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <strong className="text-xs font-semibold text-[#edf5ea] truncate">
                              {r.full_name || 'Confirmed attendee'}
                            </strong>
                            <span className="text-[10px] font-mono text-[#7ce698] bg-[#0c2012] px-1.5 py-0.2 rounded border border-[#1a4426] shrink-0">
                              {r.reference}
                            </span>
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

                      <div className="flex items-center gap-1.5 shrink-0">
                        <strong className="text-xs font-bold font-mono text-[#7ce698]">
                          {formatMoney(Number(r.amount_lkr) || TICKET_PRICE)}
                        </strong>
                        <ChevronRight size={13} className="text-[#4e6b4a]" />
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
