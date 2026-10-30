import { useEffect, useMemo, useState } from 'react'
import {
  Landmark,
  PlusCircle,
  ArrowUpRight,
  ArrowDownRight,
  Clock3,
  Trash2,
  Edit3,
  X,
  Search,
  ShieldCheck,
  Building2,
  Banknote,
  Tag,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { supabase } from '../../utils/supabase.js'
import { isSuperAdmin } from '../../SUPER_ADMIN.ts'
import FadeContent from '../FadeContent.jsx'

const EXPENSE_CATEGORIES = [
  { id: 'venue', label: 'Venue & Setup', color: '#60a5fa' },
  { id: 'sound_music', label: 'Sound & Music', color: '#a78bfa' },
  { id: 'food_beverage', label: 'Food & Beverages', color: '#f59e0b' },
  { id: 'decor', label: 'Decor & Ambience', color: '#ec4899' },
  { id: 'printing', label: 'Printing & Badges', color: '#10b981' },
  { id: 'logistics', label: 'Logistics & Transport', color: '#38bdf8' },
  { id: 'security_ops', label: 'Operations & Gate', color: '#84cc16' },
  { id: 'misc', label: 'Miscellaneous', color: '#94a3b8' },
]

const PAYMENT_METHODS = [
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'online', label: 'Online / Gateway' },
  { id: 'other', label: 'Other' },
]

function formatMoney(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString('en-LK')}`
}

export default function AdminFinancialDashboard({ currentUser, onSelectTicket }) {
  const userIsSuperAdmin = isSuperAdmin(currentUser?.email)

  const [reservations, setReservations] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  // Filters & Tabs
  const [ledgerTab, setLedgerTab] = useState('statement') // 'statement' | 'expenses' | 'inflows'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modal states
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')

  // Form Fields
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('venue')
  const [formAmount, setFormAmount] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('bank_transfer')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formRecipient, setFormRecipient] = useState('')
  const [formReceiptRef, setFormReceiptRef] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formStatus, setFormStatus] = useState('paid')

  // Load reservations and expenses
  useEffect(() => {
    let active = true
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const [resRes, expRes] = await Promise.all([
          supabase
            .from('reservations')
            .select('id, reference, full_name, email, status, amount_lkr, deduction_lkr, deduction_reason, payment_method, registration_source, created_at, reviewed_at')
            .order('created_at', { ascending: false }),
          supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false }),
        ])

        if (!active) return

        if (resRes.error) throw resRes.error
        setReservations(resRes.data || [])

        if (expRes.error) {
          // If table not found or permission error, handle gracefully
          console.warn('Could not load expenses:', expRes.error)
          setExpenses([])
        } else {
          setExpenses(expRes.data || [])
        }
      } catch (err) {
        if (!active) return
        setError(err?.message || 'Failed to load financial records.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()
    const onRefresh = () => setRevision((v) => v + 1)
    window.addEventListener('admin:refresh', onRefresh)
    return () => {
      active = false
      window.removeEventListener('admin:refresh', onRefresh)
    }
  }, [revision])

  // Inflow Computations from Ticket Sales (accounting for deductions & concessions)
  const {
    confirmedInflow,
    totalDeductions,
    concededTicketCount,
    pendingInflow,
    confirmedCount,
    pendingCount,
    onlineInflow,
    cashInflow,
  } = useMemo(() => {
    let conf = 0
    let grossConf = 0
    let deductions = 0
    let concededCount = 0
    let pend = 0
    let confCount = 0
    let pendCount = 0
    let online = 0
    let cash = 0

    for (const r of reservations) {
      const gross = Number(r.amount_lkr) || 0
      const deduction = Number(r.deduction_lkr) || 0
      const net = Math.max(0, gross - deduction)

      if (r.status === 'approved') {
        conf += net
        grossConf += gross
        confCount++
        if (deduction > 0) {
          deductions += Math.min(deduction, gross)
          concededCount++
        }
        if (r.payment_method === 'cash') {
          cash += net
        } else {
          online += net
        }
      } else if (r.status === 'pending_review') {
        pend += gross
        pendCount++
      }
    }

    return {
      confirmedInflow: conf,
      grossConfirmedRevenue: grossConf,
      totalDeductions: deductions,
      concededTicketCount: concededCount,
      pendingInflow: pend,
      confirmedCount: confCount,
      pendingCount: pendCount,
      onlineInflow: online,
      cashInflow: cash,
    }
  }, [reservations])

  // Outflow Computations from Expenses
  const { totalPaidExpenses, totalPlannedExpenses, expenseCount, categoryTotals } = useMemo(() => {
    let paid = 0
    let planned = 0
    const catMap = new Map()

    for (const exp of expenses) {
      if (exp.status === 'paid') {
        paid += exp.amount_lkr || 0
        catMap.set(exp.category, (catMap.get(exp.category) || 0) + exp.amount_lkr)
      } else {
        planned += exp.amount_lkr || 0
      }
    }

    return {
      totalPaidExpenses: paid,
      totalPlannedExpenses: planned,
      expenseCount: expenses.length,
      categoryTotals: catMap,
    }
  }, [expenses])

  // Net Liquid Bank Balance
  const netBankBalance = Math.max(0, confirmedInflow - totalPaidExpenses)
  const isDeficit = totalPaidExpenses > confirmedInflow
  const deficitAmount = isDeficit ? totalPaidExpenses - confirmedInflow : 0
  const projectedBalance = (confirmedInflow + pendingInflow) - (totalPaidExpenses + totalPlannedExpenses)

  // Combined Bank Statement Stream (Inflows + Outflows interleaved)
  const statementItems = useMemo(() => {
    const items = []

    // Approved Ticket Deposits
    for (const r of reservations) {
      if (r.status === 'approved') {
        const gross = Number(r.amount_lkr) || 0
        const deduction = Number(r.deduction_lkr) || 0
        const net = Math.max(0, gross - deduction)
        const isFree = net === 0 && deduction > 0

        let subtitle = `${r.reference} · ${r.payment_method === 'cash' ? 'Physical cash' : 'Bank transfer slip'}`
        if (deduction > 0) {
          subtitle += ` · Concession: -${formatMoney(deduction)}${r.deduction_reason ? ` (${r.deduction_reason})` : ''}`
        }

        items.push({
          type: 'inflow',
          id: `res-${r.id}`,
          date: r.reviewed_at || r.created_at,
          title: `Ticket Deposit: ${r.full_name}`,
          subtitle,
          amount: net,
          grossAmount: gross,
          deductionAmount: deduction,
          isFreePass: isFree,
          rawItem: r,
        })
      }
    }

    // Expense Debits
    for (const exp of expenses) {
      items.push({
        type: 'outflow',
        id: `exp-${exp.id}`,
        date: exp.expense_date,
        title: exp.title,
        subtitle: `${EXPENSE_CATEGORIES.find((c) => c.id === exp.category)?.label || exp.category}${exp.recipient ? ` · Paid to ${exp.recipient}` : ''}`,
        amount: exp.amount_lkr,
        rawItem: exp,
      })
    }

    // Sort descending by date
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return items
  }, [reservations, expenses])

  // Filtered lists
  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (categoryFilter !== 'all') {
      list = list.filter((e) => e.category === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.recipient || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.receipt_reference || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [expenses, categoryFilter, searchQuery])

  const filteredStatement = useMemo(() => {
    if (!searchQuery.trim()) return statementItems
    const q = searchQuery.trim().toLowerCase()
    return statementItems.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
    )
  }, [statementItems, searchQuery])

  // Reset form to blank
  function resetForm() {
    setFormTitle('')
    setFormCategory('venue')
    setFormAmount('')
    setFormPaymentMethod('bank_transfer')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormRecipient('')
    setFormReceiptRef('')
    setFormNotes('')
    setFormStatus('paid')
    setFormError('')
    setEditingExpense(null)
  }

  // Open modal for editing
  function openEditModal(exp) {
    setEditingExpense(exp)
    setFormTitle(exp.title || '')
    setFormCategory(exp.category || 'misc')
    setFormAmount(String(exp.amount_lkr || ''))
    setFormPaymentMethod(exp.payment_method || 'bank_transfer')
    setFormDate(exp.expense_date ? exp.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setFormRecipient(exp.recipient || '')
    setFormReceiptRef(exp.receipt_reference || '')
    setFormNotes(exp.notes || '')
    setFormStatus(exp.status || 'paid')
    setFormError('')
    setIsRecordModalOpen(true)
  }

  // Handle Save (Create or Update)
  async function handleSubmitExpense(e) {
    e.preventDefault()
    if (!formTitle.trim()) {
      setFormError('Please enter an expense title or payee.')
      return
    }
    const numAmount = parseInt(formAmount, 10)
    if (!numAmount || numAmount <= 0) {
      setFormError('Please enter a valid expense amount in LKR.')
      return
    }

    setFormBusy(true)
    setFormError('')

    try {
      if (editingExpense) {
        // Update existing expense
        const { data, error: updateErr } = await supabase.rpc('update_expense', {
          p_id: editingExpense.id,
          p_title: formTitle.trim(),
          p_category: formCategory,
          p_amount_lkr: numAmount,
          p_payment_method: formPaymentMethod,
          p_expense_date: formDate,
          p_recipient: formRecipient.trim() || null,
          p_receipt_reference: formReceiptRef.trim() || null,
          p_notes: formNotes.trim() || null,
          p_status: formStatus,
        })
        if (updateErr) throw updateErr

        setExpenses((prev) => prev.map((exp) => (exp.id === editingExpense.id ? data : exp)))
      } else {
        // Record new expense
        const { data, error: createErr } = await supabase.rpc('record_expense', {
          p_title: formTitle.trim(),
          p_category: formCategory,
          p_amount_lkr: numAmount,
          p_payment_method: formPaymentMethod,
          p_expense_date: formDate,
          p_recipient: formRecipient.trim() || null,
          p_receipt_reference: formReceiptRef.trim() || null,
          p_notes: formNotes.trim() || null,
          p_status: formStatus,
        })
        if (createErr) throw createErr

        setExpenses((prev) => [data, ...prev])
      }

      setIsRecordModalOpen(false)
      resetForm()
      window.dispatchEvent(new CustomEvent('admin:refresh'))
    } catch (err) {
      setFormError(err?.message || 'Could not save expense record.')
    } finally {
      setFormBusy(false)
    }
  }

  // Handle Delete
  async function handleDeleteExpense(id) {
    setFormBusy(true)
    try {
      const { error: delErr } = await supabase.rpc('delete_expense', { p_id: id })
      if (delErr) throw delErr
      setExpenses((prev) => prev.filter((exp) => exp.id !== id))
      setDeleteExpenseId(null)
      window.dispatchEvent(new CustomEvent('admin:refresh'))
    } catch (err) {
      setError(err?.message || 'Could not delete expense record.')
    } finally {
      setFormBusy(false)
    }
  }

  if (!userIsSuperAdmin) {
    return (
      <div className="admin-panel p-6 text-center space-y-3">
        <ShieldCheck size={36} className="mx-auto text-[#f59e0b]" />
        <h3 className="text-sm font-semibold text-[#fef3c7]">Super Admin Only</h3>
        <p className="text-xs text-[#9a9474]">
          Only super admins can view financial accounts.
        </p>
      </div>
    )
  }

  return (
    <FadeContent trigger="mount" duration={0.18} className="admin-financial-dashboard space-y-4">
      {/* Top Header & Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark size={20} className="text-[#52e078]" />
            <h2 className="text-base sm:text-lg font-bold text-[#e2eadd] tracking-tight m-0">
              Treasury &amp; Bank
            </h2>
            <span className="text-[10px] font-semibold text-[#f59e0b] bg-[#291e0a] px-2 py-0.5 rounded-full border border-[#5a3f12]">
              Super Admin
            </span>
          </div>
          <p className="text-xs text-[#8e8a6f] mt-0.5 mb-0">
            Track ticket income, expenses, and cash in hand.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm()
            setIsRecordModalOpen(true)
          }}
          className="admin-financial-add-btn"
        >
          <PlusCircle size={15} />
          <span>Add Expense</span>
        </button>
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {/* Hero Treasury Card (Bank Account Interface) */}
      <div className="admin-treasury-card">
        <div className="admin-treasury-card-header">
          <div className="flex items-center gap-2">
            <div className="admin-treasury-badge-icon">
              <Building2 size={16} />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#7ce698] font-bold block">
                Event Account
              </span>
              <strong className="text-xs text-[#edf5ea]"> Greens Heaven 2026</strong>
            </div>
          </div>
          <span className="text-[11px] text-[#99bca0] font-mono tabular-nums">
            {confirmedCount} tickets confirmed
          </span>
        </div>

        <div className="admin-treasury-balance-block">
          <span className="admin-treasury-balance-lbl">Current Balance</span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`admin-treasury-balance-val ${isDeficit ? 'text-[#f87171]' : 'text-[#52e078]'}`}>
              {isDeficit ? `-Rs. ${deficitAmount.toLocaleString('en-LK')}` : formatMoney(netBankBalance)}
            </span>
            
          </div>
        </div>

        {totalDeductions > 0 && (
          <div className="admin-treasury-deductions-banner">
            <Tag size={13} className="text-[#fbbf24] shrink-0" />
            <span className="text-[11px] text-[#e5f0e1]">
              Concessions: <strong className="text-[#fbbf24] tabular-nums">-{formatMoney(totalDeductions)}</strong> across <strong>{concededTicketCount}</strong> {concededTicketCount === 1 ? 'ticket' : 'tickets'}
            </span>
          </div>
        )}

        {/* 3-Cell Inflow / Outflow / Projection Ribbon */}
        <div className="admin-treasury-ribbon">
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#8ca889]">
              <ArrowDownRight size={13} className="text-[#52e078]" />
              <span>Total Inflow</span>
            </div>
            <strong className="text-sm font-bold text-[#edf5ea] tabular-nums block mt-0.5">
              {formatMoney(confirmedInflow)}
            </strong>
          
            {totalDeductions > 0 && (
              <span className="text-[9.5px] text-[#fbbf24] block mt-0.5 tabular-nums">
                (-{formatMoney(totalDeductions)} in concessions)
              </span>
            )}
          </div>

          <div className="border-x border-[#1a3821] px-2">
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#f87171]">
              <ArrowUpRight size={13} className="text-[#f87171]" />
              <span>Total Spent</span>
            </div>
            <strong className="text-sm font-bold text-[#fca5a5] tabular-nums block mt-0.5">
              {formatMoney(totalPaidExpenses)}
            </strong>
            <span className="text-[10px] text-[#8e8a6f]">
              {expenseCount} expenses
            </span>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#fbbf24]">
              <Clock3 size={13} className="text-[#fbbf24]" />
              <span>Expected Balance</span>
            </div>
            <strong className="text-sm font-bold text-[#fbbf24] tabular-nums block mt-0.5">
              {formatMoney(projectedBalance)}
            </strong>
            <span className="text-[10px] text-[#8e8a6f]">
              {pendingCount > 0
                ? `+${formatMoney(pendingInflow)} pending review (${pendingCount} ${pendingCount === 1 ? 'ticket' : 'tickets'})`
                : 'No pending reviews'}
            </span>
          </div>
        </div>
      </div>

      {/* Expense Category Breakdown Strip */}
      {expenses.length > 0 && (
        <div className="admin-panel p-3 sm:p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#d8e5cd]">Expenses by Category</span>
            <span className="text-[11px] text-[#8e8a6f]">
              Total: <strong className="text-[#edf5ea]">{formatMoney(totalPaidExpenses)}</strong>
            </span>
          </div>

          {/* Visual Ratio Bar */}
          <div className="admin-category-ratio-bar">
            {EXPENSE_CATEGORIES.map((cat) => {
              const amount = categoryTotals.get(cat.id) || 0
              if (amount <= 0 || totalPaidExpenses <= 0) return null
              const pct = (amount / totalPaidExpenses) * 100
              return (
                <div
                  key={cat.id}
                  style={{ width: `${pct}%`, backgroundColor: cat.color }}
                  title={`${cat.label}: ${formatMoney(amount)} (${pct.toFixed(1)}%)`}
                />
              )
            })}
          </div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {EXPENSE_CATEGORIES.map((cat) => {
              const amount = categoryTotals.get(cat.id) || 0
              if (amount <= 0) return null
              return (
                <span key={cat.id} className="admin-category-chip">
                  <i style={{ backgroundColor: cat.color }} />
                  <span>{cat.label}</span>
                  <strong>{formatMoney(amount)}</strong>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Transaction Ledger & Statement Section */}
      <section className="admin-panel stack" aria-label="Transactions and expenses">
        <div className="flex flex-col gap-2.5 border-b border-[#182f1d] pb-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* View Sub-Tabs */}
            <div className="admin-financial-subtabs" role="tablist">
              <button
                type="button"
                className={`admin-financial-subtab ${ledgerTab === 'statement' ? 'active' : ''}`}
                onClick={() => setLedgerTab('statement')}
              >
                <span>Statement</span>
                <span className="admin-badge-count">{statementItems.length}</span>
              </button>
              <button
                type="button"
                className={`admin-financial-subtab ${ledgerTab === 'expenses' ? 'active' : ''}`}
                onClick={() => setLedgerTab('expenses')}
              >
                <span>Expenses</span>
                <span className="admin-badge-count">{expenses.length}</span>
              </button>
              <button
                type="button"
                className={`admin-financial-subtab ${ledgerTab === 'inflows' ? 'active' : ''}`}
                onClick={() => setLedgerTab('inflows')}
              >
                <span>Ticket Sales</span>
                <span className="admin-badge-count">{confirmedCount}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="admin-financial-search-wrap">
              <Search size={14} className="text-[#5a7d57]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions…"
                className="admin-financial-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="admin-financial-clear-btn"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter for Expenses View */}
          {ledgerTab === 'expenses' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`admin-rev-pill-btn ${categoryFilter === 'all' ? 'active' : ''}`}
              >
                All ({expenses.length})
              </button>
              {EXPENSE_CATEGORIES.map((cat) => {
                const count = expenses.filter((e) => e.category === cat.id).length
                if (count === 0) return null
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`admin-rev-pill-btn ${categoryFilter === cat.id ? 'active' : ''}`}
                  >
                    {cat.label} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Content Streams */}
        {loading ? (
          <div className="py-8 text-center text-xs text-[#8ca889]">
            Loading financial records…
          </div>
        ) : ledgerTab === 'statement' ? (
          /* 1. Combined Bank Statement View */
          filteredStatement.length === 0 ? (
            <div className="admin-empty text-center py-6">
              <p className="text-xs text-[#7f997a] m-0">No transactions found.</p>
            </div>
          ) : (
            <ul className="admin-financial-statement-list">
              {filteredStatement.map((item) => (
                <li
                  key={item.id}
                  className={`admin-financial-statement-item ${item.rawItem?.status === 'approved' && onSelectTicket ? 'cursor-pointer hover:border-[#2b643a]' : ''}`}
                  onClick={() => {
                    if (item.type === 'inflow' && item.rawItem?.id && onSelectTicket) {
                      onSelectTicket(item.rawItem.id)
                    }
                  }}
                  role={item.type === 'inflow' ? 'button' : undefined}
                  tabIndex={item.type === 'inflow' ? 0 : undefined}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`admin-financial-type-pip ${item.isFreePass ? 'free' : item.type}`}>
                      {item.type === 'inflow' ? (
                        item.isFreePass ? <Tag size={13} /> : <ArrowDownRight size={14} />
                      ) : (
                        <ArrowUpRight size={14} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-xs text-[#e2eadd] block truncate">
                          {item.title}
                        </strong>
                        {item.deductionAmount > 0 && (
                          <span className={`admin-concession-pill ${item.isFreePass ? 'free' : 'half'}`}>
                            {item.isFreePass ? 'Free pass' : `-${formatMoney(item.deductionAmount)}`}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#8e8a6f] block truncate">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <strong className={`text-xs tabular-nums font-bold ${
                      item.isFreePass ? 'text-[#fbbf24]' : item.type === 'inflow' ? 'text-[#52e078]' : 'text-[#fca5a5]'
                    }`}>
                      {item.isFreePass ? 'Rs. 0 (Free)' : item.type === 'inflow' ? `+${formatMoney(item.amount)}` : `-${formatMoney(item.amount)}`}
                    </strong>
                    <time className="text-[10px] text-[#7f997a] block tabular-nums">
                      {new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : ledgerTab === 'expenses' ? (
          /* 2. Expenses Management Table / Card List */
          filteredExpenses.length === 0 ? (
            <div className="admin-empty text-center py-6">
              <p className="text-xs text-[#7f997a] m-0">No expenses recorded yet.</p>
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setIsRecordModalOpen(true)
                }}
                className="admin-financial-add-btn mt-3 mx-auto"
              >
                <PlusCircle size={14} />
                <span>Add an expense</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExpenses.map((exp) => {
                const catObj = EXPENSE_CATEGORIES.find((c) => c.id === exp.category)
                return (
                  <div key={exp.id} className="admin-expense-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-xs font-semibold text-[#edf5ea]">
                            {exp.title}
                          </strong>
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded border"
                            style={{
                              borderColor: `${catObj?.color || '#555'}40`,
                              backgroundColor: `${catObj?.color || '#555'}15`,
                              color: catObj?.color || '#ddd',
                            }}
                          >
                            {catObj?.label || exp.category}
                          </span>
                          {exp.status === 'planned' && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-[#78350f] bg-[#291e0a] text-[#fbbf24]">
                              Planned
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[#8e8a6f] mt-1 space-x-2">
                          {exp.recipient && <span>Paid to: <strong className="text-[#d8d3b5]">{exp.recipient}</strong></span>}
                          {exp.payment_method && <span>· Via: {exp.payment_method.replace('_', ' ')}</span>}
                          <span>· Date: {new Date(exp.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </div>

                        {exp.notes && (
                          <p className="text-[11px] text-[#9eb598] bg-[#0c1910] p-1.5 rounded mt-1.5 border border-[#1b3422] m-0">
                            &quot;{exp.notes}&quot;
                          </p>
                        )}
                        {exp.receipt_reference && (
                          <span className="text-[10px] text-[#7f997a] block mt-1 font-mono">
                            Ref: {exp.receipt_reference}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <strong className="text-xs font-bold text-[#fca5a5] tabular-nums">
                          -{formatMoney(exp.amount_lkr)}
                        </strong>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(exp)}
                            className="p-1 rounded text-[#9eb598] hover:text-[#edf5ea] hover:bg-[#1a3821] transition-colors"
                            aria-label={`Edit ${exp.title}`}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteExpenseId(exp.id)}
                            className="p-1 rounded text-[#f87171] hover:text-[#fca5a5] hover:bg-[#331c17] transition-colors"
                            aria-label={`Delete ${exp.title}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          /* 3. Ticket Deposits List */
          <div className="space-y-1.5">
            {reservations
              .filter((r) => r.status === 'approved')
              .map((r) => {
                const deduction = Number(r.deduction_lkr) || 0
                const gross = Number(r.amount_lkr) || 0
                const net = Math.max(0, gross - deduction)
                const isFree = net === 0 && deduction > 0
                return (
                  <div
                    key={r.id}
                    onClick={() => onSelectTicket && onSelectTicket(r.id)}
                    className="admin-expense-card cursor-pointer hover:border-[#2b643a] transition-colors"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <strong className="text-xs font-semibold text-[#edf5ea] block truncate">
                            {r.full_name}
                          </strong>
                          {deduction > 0 && (
                            <span className={`admin-concession-pill ${isFree ? 'free' : deduction >= gross / 2 ? 'half' : 'custom'}`}>
                              {isFree ? '100% Free' : deduction >= gross / 2 ? '50% Concession' : `-${formatMoney(deduction)}`}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#8e8a6f] block truncate">
                          {r.reference} · {r.payment_method === 'cash' ? 'Physical cash' : 'Bank transfer slip'}
                          {r.deduction_reason ? ` · "${r.deduction_reason}"` : ''}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        {deduction > 0 && (
                          <span className="text-[9.5px] line-through text-[#7f997a] block tabular-nums">
                            {formatMoney(gross)}
                          </span>
                        )}
                        <strong className={`text-xs font-bold tabular-nums block ${isFree ? 'text-[#fbbf24]' : 'text-[#52e078]'}`}>
                          {isFree ? 'Rs. 0 (Free)' : `+${formatMoney(net)}`}
                        </strong>
                        <span className="text-[10px] text-[#7f997a] block tabular-nums">
                          Confirmed
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      {/* Record / Edit Expense Modal Dialog */}
      <AnimatePresence>
        {isRecordModalOpen && (
          <div className="admin-cash-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="admin-financial-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="expense-dialog-title"
            >
              <div className="flex items-center justify-between border-b border-[#242b1f] pb-2.5">
                <div className="flex items-center gap-2">
                  <Banknote size={17} className="text-[#52e078]" />
                  <h3 id="expense-dialog-title" className="text-sm font-bold text-[#e2eadd] m-0">
                    {editingExpense ? 'Edit Expense' : 'Add Expense'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRecordModalOpen(false)
                    resetForm()
                  }}
                  className="text-[#8e8a6f] hover:text-[#edf5ea] p-1 rounded"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitExpense} className="space-y-3 pt-3">
                {formError && (
                  <p className="text-xs text-[#fca5a5] bg-[#331c17] p-2 rounded border border-[#7f1d1d] m-0">
                    {formError}
                  </p>
                )}

                {/* Title / Payee */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                    What was this for? *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Sound system advance, wristbands"
                    className="admin-concession-input"
                  />
                </div>

                {/* Amount & Category 2-Column Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Amount (Rs.) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#8e8a6f] pointer-events-none select-none">
                        Rs.
                      </span>
                      <input
                        type="number"
                        required
                        min="1"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder="25000"
                        className="admin-concession-input !pl-8 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Category *
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="admin-concession-input"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Payment Method & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Payment method
                    </label>
                    <select
                      value={formPaymentMethod}
                      onChange={(e) => setFormPaymentMethod(e.target.value)}
                      className="admin-concession-input"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="admin-concession-input"
                    />
                  </div>
                </div>

                {/* Recipient & Reference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Paid to (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={formRecipient}
                      onChange={(e) => setFormRecipient(e.target.value)}
                      placeholder="e.g. Sunimal, PrintWay"
                      className="admin-concession-input"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                      Receipt or bill # (optional)
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={formReceiptRef}
                      onChange={(e) => setFormReceiptRef(e.target.value)}
                      placeholder="e.g. INV-102"
                      className="admin-concession-input"
                    />
                  </div>
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#8e8a6f] font-semibold block mb-1">
                    Note (optional)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. 50% advance paid, rest after event."
                    className="admin-concession-input !h-auto py-2"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#242b1f]">
                  <button
                    type="submit"
                    disabled={formBusy}
                    className="admin-concession-btn primary flex-1"
                  >
                    {formBusy ? 'Saving…' : editingExpense ? 'Update Expense' : 'Save Expense'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecordModalOpen(false)
                      resetForm()
                    }}
                    disabled={formBusy}
                    className="admin-concession-btn secondary px-4"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteExpenseId && (
          <div className="admin-cash-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="admin-financial-modal max-w-sm"
              role="alertdialog"
              aria-labelledby="delete-dialog-title"
            >
              <h3 id="delete-dialog-title" className="text-sm font-bold text-[#fca5a5] m-0">
                Delete expense?
              </h3>
              <p className="text-xs text-[#d8d3b5] mt-2 mb-4">
                This removes the expense and adds the amount back to your balance.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteExpense(deleteExpenseId)}
                  disabled={formBusy}
                  className="admin-concession-btn primary flex-1 !bg-[#b91c1c] !border-[#ef4444]"
                >
                  {formBusy ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteExpenseId(null)}
                  disabled={formBusy}
                  className="admin-concession-btn secondary px-4"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </FadeContent>
  )
}
