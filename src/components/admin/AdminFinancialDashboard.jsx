import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Landmark,
  PlusCircle,
  ArrowUpRight,
  ArrowDownRight,
  ArrowDownLeft,
  Clock3,
  Trash2,
  Edit3,
  X,
  Search,
  ShieldCheck,
  Building2,
  Banknote,
  Tag,
  Calendar,
  Sparkles,
  RotateCcw,
  Plus,
  Minus,
  Check,
  Filter,
  CreditCard,
  AlertTriangle,
  MoreVertical,
  EyeOff,
  Wallet,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { supabase } from '../../utils/supabase.js'
import { isSuperAdmin } from '../../SUPER_ADMIN.ts'
import FadeContent from '../FadeContent.jsx'
import { MorphingModal } from '../motion/morphing-modal.jsx'
import { Input } from '../motion/input.jsx'
import { Select, SelectTrigger, SelectContent, SelectItem } from '../motion/select.jsx'
import { StatefulButton } from '../motion/button-stateful.jsx'
import { Tabs, TabsList, TabsTrigger } from '../motion/tabs.jsx'
import { cn } from '../../lib/utils.js'

function TransactionActionMenu({ title = 'transaction', onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8ea88c] hover:text-[#edf5ea] hover:bg-[#152e1c] active:bg-[#1a3823] active:scale-95 transition-all touch-manipulation"
        aria-label={`Options for ${title}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical size={14} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-1 z-30 min-w-[124px] rounded-xl border border-[#20432a] bg-[#09170e]/98 p-1 shadow-2xl shadow-black/80 backdrop-blur-xl"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onEdit()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[#c2d4be] hover:bg-[#142e1d] hover:text-[#edf5ea] active:scale-[0.98] transition-all touch-manipulation"
            >
              <Edit3 size={12.5} className="text-[#9db299]" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onDelete()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[#fca5a5] hover:bg-[#331515] hover:text-[#fee2e2] active:scale-[0.98] transition-all touch-manipulation"
            >
              <Trash2 size={12.5} className="text-[#f87171]" />
              <span>Delete</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const beuiInputStyles = {
  root: 'w-full',
  label: 'text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block',
  field: 'rounded-xl bg-[#08150d] border-[#1d3824] hover:border-[#2f5e3b] focus-within:border-[#52e078] focus-within:ring-2 focus-within:ring-[#52e078]/20 h-11 px-0.5 transition-all duration-200',
  input: 'text-xs text-[#edf5ea] placeholder:text-[#5d735a]',
  errorMessage: 'text-[11px] text-[#fca5a5] px-0.5 mt-1 font-medium',
}


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

const INCOME_CATEGORIES = [
  { id: 'sponsorship', label: 'Sponsorships & Brands', color: '#38bdf8' },
  { id: 'donation', label: 'Donations & Well-Wishers', color: '#10b981' },
  { id: 'stall_vendor', label: 'Stalls & Food Vendors', color: '#f59e0b' },
  { id: 'merchandise', label: 'Merchandise & Items', color: '#ec4899' },
  { id: 'ticket_bulk', label: 'External Bulk Tickets', color: '#a78bfa' },
  { id: 'misc', label: 'Miscellaneous Inflow', color: '#94a3b8' },
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
  const [externalIncomes, setExternalIncomes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  // Filters & Tabs
  const [ledgerTab, setLedgerTab] = useState('statement') // 'statement' | 'incomes' | 'expenses' | 'inflows'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Selective ("Picky") Expenses Add & Remove Simulation
  const [excludedExpenseIds, setExcludedExpenseIds] = useState(new Set())
  const [simulationViewFilter, setSimulationViewFilter] = useState('all') // 'all' | 'included' | 'excluded'

  // Modal states - Expenses
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState(null)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [expenseStep, setExpenseStep] = useState(1)

  // Modal states - External Incomes
  const [isRecordIncomeModalOpen, setIsRecordIncomeModalOpen] = useState(false)
  const [editingIncome, setEditingIncome] = useState(null)
  const [deleteIncomeId, setDeleteIncomeId] = useState(null)
  const [incomeFormBusy, setIncomeFormBusy] = useState(false)
  const [incomeFormError, setIncomeFormError] = useState('')
  const [incomeStep, setIncomeStep] = useState(1)

  // Form Fields - Expense
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState('venue')
  const [formAmount, setFormAmount] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('bank_transfer')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formRecipient, setFormRecipient] = useState('')
  const [formReceiptRef, setFormReceiptRef] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formStatus, setFormStatus] = useState('paid')

  // Form Fields - External Income
  const [incomeFormTitle, setIncomeFormTitle] = useState('')
  const [incomeFormCategory, setIncomeFormCategory] = useState('sponsorship')
  const [incomeFormAmount, setIncomeFormAmount] = useState('')
  const [incomeFormPaymentMethod, setIncomeFormPaymentMethod] = useState('bank_transfer')
  const [incomeFormDate, setIncomeFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [incomeFormPayer, setIncomeFormPayer] = useState('')
  const [incomeFormReceiptRef, setIncomeFormReceiptRef] = useState('')
  const [incomeFormNotes, setIncomeFormNotes] = useState('')
  const [incomeFormStatus, setIncomeFormStatus] = useState('received')

  // Load reservations, expenses, and external incomes
  useEffect(() => {
    let active = true
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const [resRes, expRes, incRes] = await Promise.all([
          supabase
            .from('reservations')
            .select('id, reference, full_name, email, status, amount_lkr, deduction_lkr, deduction_reason, payment_method, registration_source, created_at, reviewed_at')
            .order('created_at', { ascending: false }),
          supabase
            .from('expenses')
            .select('*')
            .order('expense_date', { ascending: false }),
          supabase
            .from('external_incomes')
            .select('*')
            .order('income_date', { ascending: false }),
        ])

        if (!active) return

        if (resRes.error) throw resRes.error
        setReservations(resRes.data || [])

        if (expRes.error) {
          console.warn('Could not load expenses:', expRes.error)
          setExpenses([])
        } else {
          setExpenses(expRes.data || [])
        }

        if (incRes.error) {
          console.warn('Could not load external incomes:', incRes.error)
          setExternalIncomes([])
        } else {
          setExternalIncomes(incRes.data || [])
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
    confirmedTicketInflow,
    totalDeductions,
    concededTicketCount,
    pendingTicketInflow,
    confirmedCount,
    pendingCount,
  } = useMemo(() => {
    let conf = 0
    let grossConf = 0
    let deductions = 0
    let concededCount = 0
    let pend = 0
    let confCount = 0
    let pendCount = 0

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
      } else if (r.status === 'pending_review') {
        pend += gross
        pendCount++
      }
    }

    return {
      confirmedTicketInflow: conf,
      grossConfirmedRevenue: grossConf,
      totalDeductions: deductions,
      concededTicketCount: concededCount,
      pendingTicketInflow: pend,
      confirmedCount: confCount,
      pendingCount: pendCount,
    }
  }, [reservations])

  // Inflow Computations from External Incomes (sponsorships, donations, vendors, merchandise)
  const {
    totalReceivedExternalIncome,
    totalPledgedExternalIncome,
    incomeCategoryTotals,
  } = useMemo(() => {
    let received = 0
    let pledged = 0
    const catMap = new Map()

    for (const inc of externalIncomes) {
      const amt = Number(inc.amount_lkr) || 0
      if (inc.status === 'received') {
        received += amt
        catMap.set(inc.category, (catMap.get(inc.category) || 0) + amt)
      } else {
        pledged += amt
      }
    }

    return {
      totalReceivedExternalIncome: received,
      totalPledgedExternalIncome: pledged,
      externalIncomeCount: externalIncomes.length,
      incomeCategoryTotals: catMap,
    }
  }, [externalIncomes])

  // Combined Inflow
  const totalConfirmedInflow = confirmedTicketInflow + totalReceivedExternalIncome

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
  const netBankBalance = Math.max(0, totalConfirmedInflow - totalPaidExpenses)
  const isDeficit = totalPaidExpenses > totalConfirmedInflow
  const deficitAmount = isDeficit ? totalPaidExpenses - totalConfirmedInflow : 0
  const projectedBalance = (totalConfirmedInflow + pendingTicketInflow + totalPledgedExternalIncome) - (totalPaidExpenses + totalPlannedExpenses)

  // Combined Bank Statement Stream (Inflows [tickets + external] + Outflows interleaved)
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
          subType: 'ticket',
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

    // External Incomes
    for (const inc of externalIncomes) {
      const catLabel = INCOME_CATEGORIES.find((c) => c.id === inc.category)?.label || inc.category
      let subtitle = catLabel
      if (inc.payer) subtitle += ` · From ${inc.payer}`
      if (inc.payment_method) subtitle += ` · ${inc.payment_method.replace('_', ' ')}`

      items.push({
        type: 'inflow',
        subType: 'external_income',
        id: `inc-${inc.id}`,
        date: inc.income_date,
        title: inc.title,
        subtitle,
        amount: inc.amount_lkr,
        isPledged: inc.status !== 'received',
        rawItem: inc,
      })
    }

    // Expense Debits
    for (const exp of expenses) {
      items.push({
        type: 'outflow',
        subType: 'expense',
        id: `exp-${exp.id}`,
        date: exp.expense_date,
        title: exp.title,
        subtitle: `${EXPENSE_CATEGORIES.find((c) => c.id === exp.category)?.label || exp.category}${exp.recipient ? ` · Paid to ${exp.recipient}` : ''}`,
        amount: exp.amount_lkr,
        isPlanned: exp.status !== 'paid',
        rawItem: exp,
      })
    }

    // Sort descending by date
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return items
  }, [reservations, externalIncomes, expenses])

  // Selective ("Picky") Expenses Computations
  const {
    simulatedIncludedExpenses,
    simulatedIncludedTotal,
    simulatedExcludedExpenses,
    simulatedExcludedTotal,
    isSimulationActive,
  } = useMemo(() => {
    let included = []
    let excluded = []
    let includedTotal = 0
    let excludedTotal = 0

    for (const exp of expenses) {
      if (exp.status === 'paid') {
        if (excludedExpenseIds.has(exp.id)) {
          excluded.push(exp)
          excludedTotal += (exp.amount_lkr || 0)
        } else {
          included.push(exp)
          includedTotal += (exp.amount_lkr || 0)
        }
      }
    }

    return {
      simulatedIncludedExpenses: included,
      simulatedIncludedTotal: includedTotal,
      simulatedExcludedExpenses: excluded,
      simulatedExcludedTotal: excludedTotal,
      isSimulationActive: excludedExpenseIds.size > 0,
    }
  }, [expenses, excludedExpenseIds])

  const simulatedNetBalance = Math.max(0, totalConfirmedInflow - simulatedIncludedTotal)
  const isSimulatedDeficit = simulatedIncludedTotal > totalConfirmedInflow

  function toggleExpenseSimulation(id, e) {
    e?.stopPropagation?.()
    setExcludedExpenseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function includeAllExpenses() {
    setExcludedExpenseIds(new Set())
  }

  function excludeAllExpenses() {
    setExcludedExpenseIds(new Set(expenses.map((e) => e.id)))
  }

  // Filtered lists
  const filteredExpenses = useMemo(() => {
    let list = expenses
    if (categoryFilter !== 'all') {
      list = list.filter((e) => e.category === categoryFilter)
    }
    if (simulationViewFilter === 'included') {
      list = list.filter((e) => !excludedExpenseIds.has(e.id))
    } else if (simulationViewFilter === 'excluded') {
      list = list.filter((e) => excludedExpenseIds.has(e.id))
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
  }, [expenses, categoryFilter, simulationViewFilter, excludedExpenseIds, searchQuery])


  const filteredIncomes = useMemo(() => {
    let list = externalIncomes
    if (incomeCategoryFilter !== 'all') {
      list = list.filter((i) => i.category === incomeCategoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((i) =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.payer || '').toLowerCase().includes(q) ||
        (i.notes || '').toLowerCase().includes(q) ||
        (i.receipt_reference || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [externalIncomes, incomeCategoryFilter, searchQuery])

  const filteredStatement = useMemo(() => {
    if (!searchQuery.trim()) return statementItems
    const q = searchQuery.trim().toLowerCase()
    return statementItems.filter((item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q)
    )
  }, [statementItems, searchQuery])

  // Reset expense form to blank
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
    setExpenseStep(1)
  }

  // Open modal for editing expense
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
    setExpenseStep(1)
    setIsRecordModalOpen(true)
  }

  // Handle Save Expense (Create or Update)
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

  // Handle Delete Expense
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

  // Reset external income form to blank
  function resetIncomeForm() {
    setIncomeFormTitle('')
    setIncomeFormCategory('sponsorship')
    setIncomeFormAmount('')
    setIncomeFormPaymentMethod('bank_transfer')
    setIncomeFormDate(new Date().toISOString().slice(0, 10))
    setIncomeFormPayer('')
    setIncomeFormReceiptRef('')
    setIncomeFormNotes('')
    setIncomeFormStatus('received')
    setIncomeFormError('')
    setEditingIncome(null)
    setIncomeStep(1)
  }

  // Open modal for editing external income
  function openEditIncomeModal(inc) {
    setEditingIncome(inc)
    setIncomeFormTitle(inc.title || '')
    setIncomeFormCategory(inc.category || 'misc')
    setIncomeFormAmount(String(inc.amount_lkr || ''))
    setIncomeFormPaymentMethod(inc.payment_method || 'bank_transfer')
    setIncomeFormDate(inc.income_date ? inc.income_date.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setIncomeFormPayer(inc.payer || '')
    setIncomeFormReceiptRef(inc.receipt_reference || '')
    setIncomeFormNotes(inc.notes || '')
    setIncomeFormStatus(inc.status || 'received')
    setIncomeFormError('')
    setIncomeStep(1)
    setIsRecordIncomeModalOpen(true)
  }

  // Handle Save External Income (Create or Update)
  async function handleSubmitIncome(e) {
    e.preventDefault()
    if (!incomeFormTitle.trim()) {
      setIncomeFormError('Please enter an income title or source.')
      return
    }
    const numAmount = parseInt(incomeFormAmount, 10)
    if (!numAmount || numAmount <= 0) {
      setIncomeFormError('Please enter a valid income amount in LKR.')
      return
    }

    setIncomeFormBusy(true)
    setIncomeFormError('')

    try {
      if (editingIncome) {
        // Update existing external income
        const { data, error: updateErr } = await supabase.rpc('update_external_income', {
          p_id: editingIncome.id,
          p_title: incomeFormTitle.trim(),
          p_category: incomeFormCategory,
          p_amount_lkr: numAmount,
          p_payment_method: incomeFormPaymentMethod,
          p_income_date: incomeFormDate,
          p_payer: incomeFormPayer.trim() || null,
          p_receipt_reference: incomeFormReceiptRef.trim() || null,
          p_notes: incomeFormNotes.trim() || null,
          p_status: incomeFormStatus,
        })
        if (updateErr) throw updateErr

        setExternalIncomes((prev) => prev.map((inc) => (inc.id === editingIncome.id ? data : inc)))
      } else {
        // Record new external income
        const { data, error: createErr } = await supabase.rpc('record_external_income', {
          p_title: incomeFormTitle.trim(),
          p_category: incomeFormCategory,
          p_amount_lkr: numAmount,
          p_payment_method: incomeFormPaymentMethod,
          p_income_date: incomeFormDate,
          p_payer: incomeFormPayer.trim() || null,
          p_receipt_reference: incomeFormReceiptRef.trim() || null,
          p_notes: incomeFormNotes.trim() || null,
          p_status: incomeFormStatus,
        })
        if (createErr) throw createErr

        setExternalIncomes((prev) => [data, ...prev])
      }

      setIsRecordIncomeModalOpen(false)
      resetIncomeForm()
      window.dispatchEvent(new CustomEvent('admin:refresh'))
    } catch (err) {
      setIncomeFormError(err?.message || 'Could not save external income record.')
    } finally {
      setIncomeFormBusy(false)
    }
  }

  // Handle Delete External Income
  async function handleDeleteIncome(id) {
    setIncomeFormBusy(true)
    try {
      const { error: delErr } = await supabase.rpc('delete_external_income', { p_id: id })
      if (delErr) throw delErr
      setExternalIncomes((prev) => prev.filter((inc) => inc.id !== id))
      setDeleteIncomeId(null)
      window.dispatchEvent(new CustomEvent('admin:refresh'))
    } catch (err) {
      setError(err?.message || 'Could not delete external income record.')
    } finally {
      setIncomeFormBusy(false)
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
    <FadeContent trigger="mount" duration={0.18} className="admin-financial-dashboard space-y-3">
      {/* Top Header & Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Landmark size={20} className="text-[#52e078]" />
            <h2 className="text-base sm:text-lg font-bold text-[#e2eadd] tracking-tight m-0">
              Treasury &amp; Bank
            </h2>
           
          </div>
          <p className="text-xs text-[#8e8a6f] mt-0.5 mb-0">
            Track ticket income, expenses, and cash in hand.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              resetIncomeForm()
              setIsRecordIncomeModalOpen(true)
            }}
            className="admin-financial-add-income-btn"
          >
            <PlusCircle size={15} />
            <span>Add Income</span>
          </button>
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
      </div>

      {error && <p className="admin-error" role="alert">{error}</p>}

      {/* Hero Treasury Card (Bank Account Interface) */}
      <div className="admin-treasury-card">
        <div className="admin-treasury-card-header">
          <div className="flex items-center gap-2">
            <div className="admin-treasury-badge-icon">
              <Building2 size={14} />
            </div>
            <strong className="text-xs font-semibold text-[#edf5ea]">Greens Heaven 2026</strong>
          </div>
          <span className="text-[11px] text-[#718c70] tabular-nums">
            {confirmedCount} tickets{externalIncomes.length > 0 ? ` · ${externalIncomes.length} ext` : ''}
          </span>
        </div>

        <div className="admin-treasury-balance-block">
          <span className="admin-treasury-balance-lbl">Available Balance</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`admin-treasury-balance-val ${isDeficit ? 'text-[#fca5a5]' : 'text-[#edf5ea]'}`}>
              {isDeficit ? `-Rs. ${deficitAmount.toLocaleString('en-LK')}` : formatMoney(netBankBalance)}
            </span>
            {totalDeductions > 0 && (
              <span className="text-[10px] font-medium text-[#fbbf24] bg-[#221708] border border-[#78350f]/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1 tabular-nums">
                <Tag size={9} />
                -{formatMoney(totalDeductions)} Deducted ({concededTicketCount})
              </span>
            )}
          </div>
        </div>

        {/* 3-Cell Inflow / Outflow / Projection Ribbon */}
        <div className="admin-treasury-ribbon">
          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#718c70]">
              <ArrowDownRight size={11} className="text-[#52e078]" />
              <span>Inflow</span>
            </div>
            <strong className="text-xs sm:text-sm font-semibold text-[#edf5ea] tabular-nums block mt-0.5 truncate">
              {formatMoney(totalConfirmedInflow)}
            </strong>
            <span className="text-[9.5px] text-[#5e785c] block mt-0.5 tabular-nums truncate">
              {confirmedCount} {confirmedCount === 1 ? 'ticket' : 'tickets'}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#718c70]">
              <ArrowUpRight size={11} className="text-[#f87171]" />
              <span>Spent</span>
            </div>
            <strong className="text-xs sm:text-sm font-semibold text-[#fca5a5] tabular-nums block mt-0.5 truncate">
              {formatMoney(totalPaidExpenses)}
            </strong>
            <span className="text-[9.5px] text-[#5e785c] block mt-0.5 tabular-nums truncate">
              {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-[#718c70]">
              <Clock3 size={11} className="text-[#fbbf24]" />
              <span>Expected</span>
            </div>
            <strong className="text-xs sm:text-sm font-semibold text-[#fcd34d] tabular-nums block mt-0.5 truncate">
              {formatMoney(projectedBalance)}
            </strong>
            <span className="text-[9.5px] text-[#5e785c] block mt-0.5 tabular-nums truncate">
              {pendingCount > 0 ? `+${pendingCount} pending` : 'All cleared'}
            </span>
          </div>
        </div>
      </div>

      {/* External Income Category Breakdown Strip */}
      {ledgerTab === 'incomes' && externalIncomes.length > 0 && (
        <div className="admin-panel p-3 sm:p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#d8e5cd]">External Incomes by Category</span>
            <span className="text-[11px] text-[#8e8a6f]">
              Received: <strong className="text-[#edf5ea]">{formatMoney(totalReceivedExternalIncome)}</strong>
            </span>
          </div>

          <div className="admin-category-ratio-bar">
            {INCOME_CATEGORIES.map((cat) => {
              const amount = incomeCategoryTotals.get(cat.id) || 0
              if (amount <= 0 || totalReceivedExternalIncome <= 0) return null
              const pct = (amount / totalReceivedExternalIncome) * 100
              return (
                <div
                  key={cat.id}
                  style={{ width: `${pct}%`, backgroundColor: cat.color }}
                  title={`${cat.label}: ${formatMoney(amount)} (${pct.toFixed(1)}%)`}
                />
              )
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {INCOME_CATEGORIES.map((cat) => {
              const amount = incomeCategoryTotals.get(cat.id) || 0
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

      {/* Expense Category Breakdown Strip */}
      {ledgerTab === 'expenses' && expenses.length > 0 && (
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* View Sub-Tabs powered by beUI Tabs */}
            <Tabs value={ledgerTab} onValueChange={setLedgerTab} variant="pill" className="w-full sm:w-auto">
              <TabsList className="bg-[#08150d] border border-[#1b3823] p-1 rounded-full flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
                <TabsTrigger
                  value="statement"
                  className="text-xs px-3 py-1.5 rounded-full"
                  indicatorClassName="bg-[#142e1d] border border-[#235332] shadow-sm"
                >
                  <span>Statement</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#1b3524] text-[10px] text-[#78d893] font-bold">
                    {statementItems.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="incomes"
                  className="text-xs px-3 py-1.5 rounded-full"
                  indicatorClassName="bg-[#0c2838] border border-[#1b4b66] shadow-sm"
                >
                  <span>External Incomes</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#163b4f] text-[10px] text-[#38bdf8] font-bold">
                    {externalIncomes.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="expenses"
                  className="text-xs px-3 py-1.5 rounded-full"
                  indicatorClassName="bg-[#2a1717] border border-[#5c2424] shadow-sm"
                >
                  <span>Expenses</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#3d1c1c] text-[10px] text-[#fca5a5] font-bold">
                    {expenses.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="inflows"
                  className="text-xs px-3 py-1.5 rounded-full"
                  indicatorClassName="bg-[#142e1d] border border-[#235332] shadow-sm"
                >
                  <span>Ticket Sales</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#1b3524] text-[10px] text-[#78d893] font-bold">
                    {confirmedCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Search Input */}
            <div className="admin-financial-search-wrap">
              <Search size={15} className="text-[#5a7d57] shrink-0" />
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

          {/* Category Filter for External Incomes View */}
          {ledgerTab === 'incomes' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setIncomeCategoryFilter('all')}
                className={`admin-rev-pill-btn ${incomeCategoryFilter === 'all' ? 'active' : ''}`}
              >
                All ({externalIncomes.length})
              </button>
              {INCOME_CATEGORIES.map((cat) => {
                const count = externalIncomes.filter((i) => i.category === cat.id).length
                if (count === 0) return null
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setIncomeCategoryFilter(cat.id)}
                    className={`admin-rev-pill-btn ${incomeCategoryFilter === cat.id ? 'active' : ''}`}
                  >
                    {cat.label} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Category Filters + Selective Actions for Expenses View (Time Filter removed) */}
          {ledgerTab === 'expenses' && (
            <div className="space-y-2 pt-1 border-t border-[#182f1d]">
              {/* Row 1: Add/Remove Simulation Filter Mode */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] uppercase font-semibold text-[#8da488] flex items-center gap-1 mr-1">
                  <Filter size={12} className="text-[#8da488]" />
                  <span>Filter:</span>
                </span>
                {[
                  { id: 'all', label: `All (${expenses.length})` },
                  { id: 'included', label: `Included (${simulatedIncludedExpenses.length})` },
                  { id: 'excluded', label: `Removed (${simulatedExcludedExpenses.length})` },
                ].map((sf) => (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => setSimulationViewFilter(sf.id)}
                    className={`admin-rev-pill-btn ${simulationViewFilter === sf.id ? 'active' : ''}`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>

              {/* Row 2: Category Filter Pills */}
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
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`admin-financial-type-pip ${item.isFreePass ? 'free' : item.type}`}>
                      {item.type === 'inflow' ? (
                        item.isFreePass ? <Tag size={12} /> : <ArrowDownRight size={13} />
                      ) : (
                        <ArrowUpRight size={13} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <strong className="text-xs sm:text-[13px] text-[#e2eadd] truncate block">
                            {item.title}
                          </strong>
                          {item.deductionAmount > 0 && (
                            <span className={`admin-concession-pill shrink-0 ${item.isFreePass ? 'free' : 'half'}`}>
                              {item.isFreePass ? 'Free pass' : `-${formatMoney(item.deductionAmount)}`}
                            </span>
                          )}
                        </div>

                        <strong className={`text-xs sm:text-[13px] tabular-nums font-bold shrink-0 ${
                          item.isFreePass ? 'text-[#fbbf24]' : item.type === 'inflow' ? 'text-[#52e078]' : 'text-[#fca5a5]'
                        }`}>
                          {item.isFreePass ? 'Rs. 0 (Free)' : item.type === 'inflow' ? `+${formatMoney(item.amount)}` : `-${formatMoney(item.amount)}`}
                        </strong>
                      </div>

                      <div className="flex items-center justify-between gap-2 min-w-0 mt-0.5">
                        <span className="text-[10.5px] text-[#8e8a6f] truncate block">
                          {item.subtitle}
                        </span>
                        <time className="text-[10px] text-[#7f997a] shrink-0 tabular-nums">
                          {new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </time>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : ledgerTab === 'incomes' ? (
          /* 2. External Incomes Management List */
          filteredIncomes.length === 0 ? (
            <div className="admin-empty text-center py-6">
              <p className="text-xs text-[#7f997a] m-0">No external income records found.</p>
              <button
                type="button"
                onClick={() => {
                  resetIncomeForm()
                  setIsRecordIncomeModalOpen(true)
                }}
                className="admin-financial-add-income-btn mt-3 mx-auto"
              >
                <PlusCircle size={14} />
                <span>Add external income</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredIncomes.map((inc) => {
                const catObj = INCOME_CATEGORIES.find((c) => c.id === inc.category)
                const formattedDate = inc.income_date
                  ? new Date(inc.income_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : ''
                return (
                  <div key={inc.id} className="admin-expense-card">
                    <div className="flex items-center gap-2.5">
                      <div className="admin-financial-type-pip inflow shrink-0">
                        <ArrowDownRight size={13} />
                      </div>

                      <div className="min-w-0 flex-1">
                        {/* Row 1: Title + Status Pill vs Amount + 3-Dot Menu */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <strong className="text-xs sm:text-[13px] font-semibold text-[#edf5ea] truncate">
                              {inc.title}
                            </strong>
                            {inc.status === 'pledged' && (
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded border border-[#78350f] bg-[#291e0a] text-[#fbbf24] shrink-0 leading-tight">
                                Pledged
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <strong className="text-xs sm:text-[13px] font-bold text-[#52e078] tabular-nums">
                              +{formatMoney(inc.amount_lkr)}
                            </strong>
                            <TransactionActionMenu
                              title={inc.title}
                              onEdit={() => openEditIncomeModal(inc)}
                              onDelete={() => setDeleteIncomeId(inc.id)}
                            />
                          </div>
                        </div>

                        {/* Row 2: Category Badge · Date · Payment Method · Payer */}
                        <div className="flex items-center gap-1.5 text-[10.5px] text-[#8e8a6f] truncate mt-0.5">
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded border inline-flex items-center gap-1 shrink-0 leading-none"
                            style={{
                              borderColor: `${catObj?.color || '#555'}40`,
                              backgroundColor: `${catObj?.color || '#555'}15`,
                              color: catObj?.color || '#ddd',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: catObj?.color || '#888' }}
                            />
                            {catObj?.label || inc.category}
                          </span>

                          {formattedDate && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="shrink-0">{formattedDate}</span>
                            </>
                          )}

                          {inc.payment_method && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="shrink-0 capitalize">{inc.payment_method.replace('_', ' ')}</span>
                            </>
                          )}

                          {inc.payer && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="truncate text-[#c5d6c2]">From {inc.payer}</span>
                            </>
                          )}
                        </div>

                        {/* Optional notes or receipt ref */}
                        {(inc.notes || inc.receipt_reference) && (
                          <div className="flex items-center gap-2 text-[10px] text-[#8ca889] mt-1 pt-1 border-t border-[#1a3822]/40 truncate">
                            {inc.notes && (
                              <span className="truncate text-[#9eb598]">
                                {inc.notes}
                              </span>
                            )}
                            {inc.notes && inc.receipt_reference && (
                              <span className="text-[#3b5940]">·</span>
                            )}
                            {inc.receipt_reference && (
                              <span className="font-mono text-[#7f997a] shrink-0">
                                Ref: {inc.receipt_reference}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
            <div className="space-y-1.5">
              {/* Revenue & Expenses Simulation Board */}
              <div className="admin-selective-financial-board">
                <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-[#1f4728]/70 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-[#142e1d] border border-[#225732] text-[#52e078] flex items-center justify-center shrink-0 shadow-sm">
                      <Sparkles size={13} />
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <strong className="text-xs font-semibold text-[#e1f5e5]">
                        Analyze
                      </strong>
                      {isSimulationActive ? (
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full bg-[#271d0b] text-[#fbbf24] border border-[#78350f]/60">
                          <EyeOff size={9} />
                          <span>{simulatedExcludedExpenses.length} off</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-medium px-1.5 py-0.2 rounded-full bg-[#132c1a] text-[#86efac] border border-[#225732]/60">
                          <CheckCircle2 size={9} />
                          <span>Live</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isSimulationActive && (
                      <button
                        type="button"
                        onClick={includeAllExpenses}
                        className="admin-sim-action-btn reset"
                        title="Reset simulation to actual ledger"
                      >
                        <RotateCcw size={10} />
                        <span>Reset</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={excludeAllExpenses}
                      className="admin-sim-action-btn"
                      title="Exclude all expenses"
                    >
                      <Minus size={10} />
                      <span>All</span>
                    </button>
                    <button
                      type="button"
                      onClick={includeAllExpenses}
                      className="admin-sim-action-btn"
                      title="Include all expenses"
                    >
                      <Plus size={10} />
                      <span>All</span>
                    </button>
                  </div>
                </div>

                {/* 4-Stat Simulation Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {/* Metric 1: Inflow */}
                  <div className="bg-[#08170d]/90 border border-[#1b3821] rounded-lg p-2">
                    <div className="flex items-center gap-1 text-[#8ca889] text-[9.5px] font-medium">
                      <ArrowDownLeft size={11} className="text-[#52e078]" />
                      <span>Inflow</span>
                    </div>
                    <strong className="text-xs sm:text-[13px] font-bold text-[#52e078] tabular-nums block mt-0.5">
                      {formatMoney(totalConfirmedInflow)}
                    </strong>
                  </div>

                  {/* Metric 2: Expenses */}
                  <div className="bg-[#08170d]/90 border border-[#1b3821] rounded-lg p-2">
                    <div className="flex items-center gap-1 text-[#8ca889] text-[9.5px] font-medium">
                      <ArrowUpRight size={11} className="text-[#fca5a5]" />
                      <span>Expenses</span>
                    </div>
                    <strong className="text-xs sm:text-[13px] font-bold text-[#fca5a5] tabular-nums block mt-0.5">
                      -{formatMoney(simulatedIncludedTotal)}
                    </strong>
                  </div>

                  {/* Metric 3: Excluded */}
                  <div className="bg-[#08170d]/90 border border-[#1b3821] rounded-lg p-2">
                    <div className="flex items-center gap-1 text-[#8ca889] text-[9.5px] font-medium">
                      <EyeOff size={11} className={simulatedExcludedTotal > 0 ? 'text-[#fbbf24]' : 'text-[#718b6e]'} />
                      <span>Excluded</span>
                    </div>
                    <strong className={`text-xs sm:text-[13px] font-bold tabular-nums block mt-0.5 ${simulatedExcludedTotal > 0 ? 'text-[#fbbf24]' : 'text-[#718b6e]'}`}>
                      +{formatMoney(simulatedExcludedTotal)}
                    </strong>
                  </div>

                  {/* Metric 4: Net Balance */}
                  <div className="bg-[#08170d]/90 border border-[#1b3821] rounded-lg p-2">
                    <div className="flex items-center gap-1 text-[#8ca889] text-[9.5px] font-medium">
                      <Wallet size={11} className={isSimulatedDeficit ? 'text-[#f87171]' : 'text-[#52e078]'} />
                      <span>Net</span>
                    </div>
                    <strong className={`text-xs sm:text-[13px] font-bold tabular-nums block mt-0.5 ${isSimulatedDeficit ? 'text-[#f87171]' : 'text-[#52e078]'}`}>
                      {formatMoney(simulatedNetBalance)}
                    </strong>
                  </div>
                </div>

                {isSimulationActive && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#1b3821]/70 flex items-center justify-between text-[10px] text-[#c0d6bd]">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={10} className="text-[#fbbf24]" />
                      <span>Net: <strong>{formatMoney(simulatedNetBalance)}</strong> (+{formatMoney(simulatedExcludedTotal)} vs actual)</span>
                    </span>
                    <button
                      type="button"
                      onClick={includeAllExpenses}
                      className="text-[#86efac] underline hover:text-[#52e078] shrink-0 ml-2"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {filteredExpenses.map((exp) => {
                const catObj = EXPENSE_CATEGORIES.find((c) => c.id === exp.category)
                const isExcluded = excludedExpenseIds.has(exp.id)
                const formattedDate = exp.expense_date
                  ? new Date(exp.expense_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : ''
                return (
                  <div
                    key={exp.id}
                    onClick={(e) => {
                      if (e.target.closest('button')) return
                      toggleExpenseSimulation(exp.id, e)
                    }}
                    className={`admin-expense-card cursor-pointer transition-all ${isExcluded ? 'sim-excluded' : 'sim-included'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Single Clean Interactive Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleExpenseSimulation(exp.id, e)}
                        className={`admin-sim-icon-btn shrink-0 ${isExcluded ? 'excluded' : 'included'}`}
                        title={isExcluded ? 'Tap to include in calculation' : 'Tap to exclude from calculation'}
                        aria-label={isExcluded ? `Include ${exp.title}` : `Exclude ${exp.title}`}
                      >
                        {isExcluded ? (
                          <EyeOff size={12} className="text-[#fbbf24]" />
                        ) : (
                          <Check size={12} className="text-[#52e078]" strokeWidth={2.5} />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        {/* Row 1: Title + Status Pills vs Amount + 3-Dot Menu */}
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <strong className={`text-xs sm:text-[13px] font-semibold truncate ${isExcluded ? 'text-[#8ea68c] line-through' : 'text-[#edf5ea]'}`}>
                              {exp.title}
                            </strong>
                            {exp.status === 'planned' && (
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded border border-[#78350f] bg-[#291e0a] text-[#fbbf24] shrink-0 leading-tight">
                                Planned
                              </span>
                            )}
                            {isExcluded && (
                              <span className="text-[9px] font-medium px-1.5 py-0.2 rounded border border-[#78350f] bg-[#221609] text-[#fbbf24] shrink-0 leading-tight">
                                Excluded
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <strong className={`text-xs sm:text-[13px] font-bold tabular-nums ${isExcluded ? 'text-[#718b6e] line-through' : 'text-[#fca5a5]'}`}>
                              -{formatMoney(exp.amount_lkr)}
                            </strong>
                            <TransactionActionMenu
                              title={exp.title}
                              onEdit={() => openEditModal(exp)}
                              onDelete={() => setDeleteExpenseId(exp.id)}
                            />
                          </div>
                        </div>

                        {/* Row 2: Category Badge · Date · Payment Method · Recipient */}
                        <div className="flex items-center gap-1.5 text-[10.5px] text-[#8e8a6f] truncate mt-0.5">
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded border inline-flex items-center gap-1 shrink-0 leading-none"
                            style={{
                              borderColor: `${catObj?.color || '#555'}40`,
                              backgroundColor: `${catObj?.color || '#555'}15`,
                              color: catObj?.color || '#ddd',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: catObj?.color || '#888' }}
                            />
                            {catObj?.label || exp.category}
                          </span>

                          {formattedDate && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="shrink-0">{formattedDate}</span>
                            </>
                          )}

                          {exp.payment_method && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="shrink-0 capitalize">{exp.payment_method.replace('_', ' ')}</span>
                            </>
                          )}

                          {exp.recipient && (
                            <>
                              <span className="text-[#3b5940]">·</span>
                              <span className="truncate text-[#a3b89f]">To {exp.recipient}</span>
                            </>
                          )}
                        </div>

                        {/* Optional notes or receipt ref */}
                        {(exp.notes || exp.receipt_reference) && (
                          <div className="flex items-center gap-2 text-[10px] text-[#8ca889] mt-1 pt-1 border-t border-[#1a3822]/40 truncate">
                            {exp.notes && (
                              <span className="truncate text-[#9eb598]">
                                {exp.notes}
                              </span>
                            )}
                            {exp.notes && exp.receipt_reference && (
                              <span className="text-[#3b5940]">·</span>
                            )}
                            {exp.receipt_reference && (
                              <span className="font-mono text-[#7f997a] shrink-0">
                                Ref: {exp.receipt_reference}
                              </span>
                            )}
                          </div>
                        )}
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
                    <div className="flex items-center gap-2.5">
                      <div className="admin-financial-type-pip inflow shrink-0">
                        <ArrowDownRight size={13} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <strong className="text-xs sm:text-[13px] font-semibold text-[#edf5ea] truncate block">
                              {r.full_name}
                            </strong>
                            {deduction > 0 && (
                              <span className={`admin-concession-pill shrink-0 ${isFree ? 'free' : deduction >= gross / 2 ? 'half' : 'custom'}`}>
                                {isFree ? '100% Free' : deduction >= gross / 2 ? '50% Concession' : `-${formatMoney(deduction)}`}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {deduction > 0 && (
                              <span className="text-[10px] line-through text-[#7f997a] tabular-nums">
                                {formatMoney(gross)}
                              </span>
                            )}
                            <strong className={`text-xs sm:text-[13px] font-bold tabular-nums block ${isFree ? 'text-[#fbbf24]' : 'text-[#52e078]'}`}>
                              {isFree ? 'Rs. 0 (Free)' : `+${formatMoney(net)}`}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 min-w-0 mt-0.5">
                          <span className="text-[10.5px] text-[#8e8a6f] truncate block">
                            {r.reference} · {r.payment_method === 'cash' ? 'Physical cash' : 'Bank transfer slip'}
                            {r.deduction_reason ? ` · "${r.deduction_reason}"` : ''}
                          </span>
                          <span className="text-[9.5px] text-[#78d893] bg-[#142e1d] border border-[#235332] px-1.5 py-0.2 rounded shrink-0 font-medium">
                            Confirmed
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      {/* 1. Record / Edit Expense Morphing Modal */}
      <MorphingModal
        viewId={isRecordModalOpen ? 'expense-form' : null}
        onClose={() => {
          setIsRecordModalOpen(false)
          resetForm()
        }}
        busy={formBusy}
        titleId="expense-dialog-title"
        className="admin-financial-dialog-wrap"
      >
        <div className="admin-financial-dialog">
          <div className="flex items-center justify-between border-b border-[#1c3823] pb-3 mb-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#142e1d] border border-[#235332] text-[#52e078] shadow-md shadow-[#142e1d]/40">
                <Banknote size={20} />
              </div>
              <div>
                <h3 id="expense-dialog-title" className="text-lg font-serif font-medium tracking-wide text-[#edf5ea] m-0">
                  {editingExpense ? 'Edit Expense' : 'Add Expense'}
                </h3>
                <p className="text-[11px] text-[#8ea68c] m-0 mt-0.5">
                  {expenseStep === 1 ? 'Step 1 of 2: General details' : 'Step 2 of 2: Receipt & notes (optional)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsRecordModalOpen(false)
                resetForm()
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#8e8a6f] hover:text-[#edf5ea] hover:bg-[#152a1a] transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Stepper Bar */}
          <div className="flex items-center justify-between p-1 bg-[#06120a] border border-[#18311e] rounded-xl mb-3.5">
            <button
              type="button"
              onClick={() => setExpenseStep(1)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-all touch-manipulation",
                expenseStep === 1
                  ? "bg-[#142e1d] border border-[#235332] text-[#edf5ea] shadow-sm"
                  : "text-[#8ea68c] hover:text-[#edf5ea]"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 transition-colors",
                  expenseStep === 1
                    ? "bg-[#52e078] text-[#052e16]"
                    : "bg-[#152e1c] text-[#8ea68c] border border-[#22482c]"
                )}
              >
                1
              </span>
              <span>General</span>
            </button>

            <div className="w-4 h-[1px] bg-[#1a3822] shrink-0" />

            <button
              type="button"
              onClick={() => {
                if (!formTitle.trim()) {
                  setFormError('Please enter what this expense was for')
                  return
                }
                if (!formAmount || Number(formAmount) <= 0) {
                  setFormError('Please enter a valid amount')
                  return
                }
                setExpenseStep(2)
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-all touch-manipulation",
                expenseStep === 2
                  ? "bg-[#142e1d] border border-[#235332] text-[#edf5ea] shadow-sm"
                  : "text-[#8ea68c] hover:text-[#edf5ea]"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 transition-colors",
                  expenseStep === 2
                    ? "bg-[#52e078] text-[#052e16]"
                    : "bg-[#152e1c] text-[#8ea68c] border border-[#22482c]"
                )}
              >
                2
              </span>
              <span>Details</span>
              <span className="text-[10px] text-[#718b6e] font-normal">(Optional)</span>
            </button>
          </div>

          <form onSubmit={handleSubmitExpense} className="space-y-3.5">
            {formError && (
              <p className="text-xs text-[#fca5a5] bg-[#331c17] p-2.5 rounded-xl border border-[#7f1d1d] m-0 font-medium">
                {formError}
              </p>
            )}

            <AnimatePresence mode="wait">
              {expenseStep === 1 ? (
                <motion.div
                  key="expense-step-1"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5"
                >
                  <Input
                    id="expense-title"
                    label="What was this for? *"
                    type="text"
                    required
                    maxLength={200}
                    value={formTitle}
                    onChange={(val) => {
                      setFormTitle(val)
                      setFormError('')
                    }}
                    placeholder="e.g. Sound system advance, wristbands"
                    leftIcon={<Tag size={15} className="text-[#9db299]" />}
                    classNames={beuiInputStyles}
                    error={formError && !formTitle.trim() ? 'Expense title is required' : undefined}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      id="expense-amount"
                      label="Amount (Rs.) *"
                      type="number"
                      required
                      min="1"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={formAmount}
                      onChange={(val) => {
                        setFormAmount(val)
                        setFormError('')
                      }}
                      placeholder="25000"
                      leftIcon={
                        <span className="text-[11px] font-bold text-[#52e078] bg-[#142e1d] border border-[#235332] px-1.5 py-0.5 rounded-md">
                          Rs.
                        </span>
                      }
                      classNames={beuiInputStyles}
                    />

                    <div className="w-full">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                        Category *
                      </label>
                      <Select value={formCategory} onValueChange={(val) => setFormCategory(val)}>
                        <SelectTrigger>
                          <div className="flex items-center gap-2 truncate">
                            {(() => {
                              const cat = EXPENSE_CATEGORIES.find((c) => c.id === formCategory)
                              return (
                                <>
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: cat?.color || '#52e078' }}
                                  />
                                  <span className="truncate">{cat?.label || 'Select Category'}</span>
                                </>
                              )
                            })()}
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span>{c.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="w-full">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                        Payment method
                      </label>
                      <Select value={formPaymentMethod} onValueChange={(val) => setFormPaymentMethod(val)}>
                        <SelectTrigger>
                          <div className="flex items-center gap-2 truncate">
                            <CreditCard size={14} className="text-[#9db299] shrink-0" />
                            <span className="truncate">
                              {PAYMENT_METHODS.find((m) => m.id === formPaymentMethod)?.label || 'Payment Method'}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span>{m.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Input
                      id="expense-date"
                      label="Date"
                      type="date"
                      value={formDate}
                      onChange={(val) => setFormDate(val)}
                      leftIcon={<Calendar size={15} className="text-[#9db299]" />}
                      classNames={beuiInputStyles}
                    />
                  </div>

                  {/* Step 1 Actions */}
                  <div className="flex items-center gap-2.5 pt-3 border-t border-[#1c3823]">
                    <StatefulButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsRecordModalOpen(false)
                        resetForm()
                      }}
                      disabled={formBusy}
                      className="px-4"
                    >
                      Cancel
                    </StatefulButton>
                    <button
                      type="button"
                      onClick={() => {
                        if (!formTitle.trim()) {
                          setFormError('Please enter what this expense was for')
                          return
                        }
                        if (!formAmount || Number(formAmount) <= 0) {
                          setFormError('Please enter a valid amount')
                          return
                        }
                        setExpenseStep(2)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-[#142e1d] hover:bg-[#1a3d27] border border-[#235332] text-xs font-semibold text-[#edf5ea] transition-all touch-manipulation active:scale-[0.98]"
                    >
                      <span>More Details</span>
                      <ArrowRight size={14} className="text-[#52e078]" />
                    </button>
                    <StatefulButton
                      type="submit"
                      variant="primary"
                      state={formBusy ? 'loading' : 'idle'}
                      loadingText="Saving…"
                      className="px-5"
                    >
                      Save
                    </StatefulButton>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="expense-step-2"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      id="expense-recipient"
                      label="Paid to (optional)"
                      type="text"
                      maxLength={200}
                      value={formRecipient}
                      onChange={(val) => setFormRecipient(val)}
                      placeholder="e.g. Sunimal, PrintWay"
                      leftIcon={<Building2 size={15} className="text-[#9db299]" />}
                      classNames={beuiInputStyles}
                    />

                    <Input
                      id="expense-receipt-ref"
                      label="Receipt or bill # (optional)"
                      type="text"
                      maxLength={100}
                      value={formReceiptRef}
                      onChange={(val) => setFormReceiptRef(val)}
                      placeholder="e.g. INV-102"
                      leftIcon={<ShieldCheck size={15} className="text-[#9db299]" />}
                      classNames={beuiInputStyles}
                    />
                  </div>

                  <div className="w-full">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                      Note (optional)
                    </label>
                    <div className="relative rounded-xl border border-[#1d3824] bg-[#08150d] p-3 transition-all duration-200 focus-within:border-[#52e078] focus-within:ring-2 focus-within:ring-[#52e078]/20 hover:border-[#2f5e3b]">
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        placeholder="e.g. 50% advance paid, rest after event."
                        className="w-full resize-none bg-transparent text-xs text-[#edf5ea] placeholder:text-[#5d735a] outline-none"
                      />
                    </div>
                  </div>

                  {/* Step 2 Actions */}
                  <div className="flex items-center gap-3 pt-3 border-t border-[#1c3823]">
                    <StatefulButton
                      type="button"
                      variant="secondary"
                      onClick={() => setExpenseStep(1)}
                      disabled={formBusy}
                      className="px-5 flex items-center gap-1.5"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </StatefulButton>
                    <StatefulButton
                      type="submit"
                      variant="primary"
                      state={formBusy ? 'loading' : 'idle'}
                      loadingText="Saving expense…"
                      className="flex-1"
                    >
                      {editingExpense ? 'Update Expense' : 'Save Expense'}
                    </StatefulButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </MorphingModal>

      {/* 2. Delete Expense Confirmation Morphing Modal */}
      <MorphingModal
        viewId={deleteExpenseId ? 'delete-expense-confirm' : null}
        onClose={() => setDeleteExpenseId(null)}
        busy={formBusy}
        titleId="delete-expense-dialog-title"
        className="admin-financial-confirm-wrap"
      >
        <div className="admin-financial-dialog text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#3b1515] border border-[#7f1d1d] text-[#fca5a5]">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 id="delete-expense-dialog-title" className="text-lg font-serif font-medium text-[#fca5a5] m-0">
                Delete expense?
              </h3>
              <p className="text-[11px] text-[#d8d3b5] m-0 mt-0.5">
                This removes the expense and adds the amount back to your balance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <StatefulButton
              type="button"
              variant="danger"
              state={formBusy ? 'loading' : 'idle'}
              loadingText="Deleting…"
              onClick={() => handleDeleteExpense(deleteExpenseId)}
              className="flex-1"
            >
              Delete
            </StatefulButton>
            <StatefulButton
              type="button"
              variant="secondary"
              onClick={() => setDeleteExpenseId(null)}
              disabled={formBusy}
              className="px-5"
            >
              Cancel
            </StatefulButton>
          </div>
        </div>
      </MorphingModal>

      {/* 3. Record / Edit External Income Morphing Modal */}
      <MorphingModal
        viewId={isRecordIncomeModalOpen ? 'income-form' : null}
        onClose={() => {
          setIsRecordIncomeModalOpen(false)
          resetIncomeForm()
        }}
        busy={incomeFormBusy}
        titleId="income-dialog-title"
        className="admin-financial-dialog-wrap"
      >
        <div className="admin-financial-dialog">
          <div className="flex items-center justify-between border-b border-[#1c3823] pb-3 mb-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0c2838] border border-[#1b4b66] text-[#38bdf8] shadow-md shadow-[#0c2838]/40">
                <Landmark size={20} />
              </div>
              <div>
                <h3 id="income-dialog-title" className="text-lg font-serif font-medium tracking-wide text-[#edf5ea] m-0">
                  {editingIncome ? 'Edit External Income' : 'Add External Income'}
                </h3>
                <p className="text-[11px] text-[#8ea68c] m-0 mt-0.5">
                  {incomeStep === 1 ? 'Step 1 of 2: General details' : 'Step 2 of 2: Details & notes (optional)'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsRecordIncomeModalOpen(false)
                resetIncomeForm()
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#8e8a6f] hover:text-[#edf5ea] hover:bg-[#152a1a] transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Stepper Bar */}
          <div className="flex items-center justify-between p-1 bg-[#06120a] border border-[#18311e] rounded-xl mb-3.5">
            <button
              type="button"
              onClick={() => setIncomeStep(1)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-all touch-manipulation",
                incomeStep === 1
                  ? "bg-[#0c2838] border border-[#1b4b66] text-[#edf5ea] shadow-sm"
                  : "text-[#8ea68c] hover:text-[#edf5ea]"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 transition-colors",
                  incomeStep === 1
                    ? "bg-[#38bdf8] text-[#082030]"
                    : "bg-[#152e1c] text-[#8ea68c] border border-[#22482c]"
                )}
              >
                1
              </span>
              <span>General</span>
            </button>

            <div className="w-4 h-[1px] bg-[#1a3822] shrink-0" />

            <button
              type="button"
              onClick={() => {
                if (!incomeFormTitle.trim()) {
                  setIncomeFormError('Please enter an income title or source')
                  return
                }
                if (!incomeFormAmount || Number(incomeFormAmount) <= 0) {
                  setIncomeFormError('Please enter a valid amount')
                  return
                }
                setIncomeStep(2)
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium transition-all touch-manipulation",
                incomeStep === 2
                  ? "bg-[#0c2838] border border-[#1b4b66] text-[#edf5ea] shadow-sm"
                  : "text-[#8ea68c] hover:text-[#edf5ea]"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-bold shrink-0 transition-colors",
                  incomeStep === 2
                    ? "bg-[#38bdf8] text-[#082030]"
                    : "bg-[#152e1c] text-[#8ea68c] border border-[#22482c]"
                )}
              >
                2
              </span>
              <span>Details</span>
              <span className="text-[10px] text-[#718b6e] font-normal">(Optional)</span>
            </button>
          </div>

          <form onSubmit={handleSubmitIncome} className="space-y-3.5">
            {incomeFormError && (
              <p className="text-xs text-[#fca5a5] bg-[#331c17] p-2.5 rounded-xl border border-[#7f1d1d] m-0 font-medium">
                {incomeFormError}
              </p>
            )}

            <AnimatePresence mode="wait">
              {incomeStep === 1 ? (
                <motion.div
                  key="income-step-1"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5"
                >
                  <Input
                    id="income-title"
                    label="Income title or source *"
                    type="text"
                    required
                    maxLength={200}
                    value={incomeFormTitle}
                    onChange={(val) => {
                      setIncomeFormTitle(val)
                      setIncomeFormError('')
                    }}
                    placeholder="e.g. Dialog Axiata Sponsorship, Food Stall #3"
                    leftIcon={<Tag size={15} className="text-[#9db299]" />}
                    classNames={beuiInputStyles}
                    error={incomeFormError && !incomeFormTitle.trim() ? 'Income title is required' : undefined}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      id="income-amount"
                      label="Amount (Rs.) *"
                      type="number"
                      required
                      min="1"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={incomeFormAmount}
                      onChange={(val) => {
                        setIncomeFormAmount(val)
                        setIncomeFormError('')
                      }}
                      placeholder="50000"
                      leftIcon={
                        <span className="text-[11px] font-bold text-[#38bdf8] bg-[#0c2838] border border-[#1b4b66] px-1.5 py-0.5 rounded-md">
                          Rs.
                        </span>
                      }
                      classNames={beuiInputStyles}
                    />

                    <div className="w-full">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                        Category *
                      </label>
                      <Select value={incomeFormCategory} onValueChange={(val) => setIncomeFormCategory(val)}>
                        <SelectTrigger>
                          <div className="flex items-center gap-2 truncate">
                            {(() => {
                              const cat = INCOME_CATEGORIES.find((c) => c.id === incomeFormCategory)
                              return (
                                <>
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: cat?.color || '#38bdf8' }}
                                  />
                                  <span className="truncate">{cat?.label || 'Select Category'}</span>
                                </>
                              )
                            })()}
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {INCOME_CATEGORIES.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span>{c.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="w-full">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                        Payment method
                      </label>
                      <Select value={incomeFormPaymentMethod} onValueChange={(val) => setIncomeFormPaymentMethod(val)}>
                        <SelectTrigger>
                          <div className="flex items-center gap-2 truncate">
                            <CreditCard size={14} className="text-[#9db299] shrink-0" />
                            <span className="truncate">
                              {PAYMENT_METHODS.find((m) => m.id === incomeFormPaymentMethod)?.label || 'Payment Method'}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <span>{m.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Input
                      id="income-date"
                      label="Date"
                      type="date"
                      value={incomeFormDate}
                      onChange={(val) => setIncomeFormDate(val)}
                      leftIcon={<Calendar size={15} className="text-[#9db299]" />}
                      classNames={beuiInputStyles}
                    />
                  </div>

                  {/* Step 1 Actions */}
                  <div className="flex items-center gap-2.5 pt-3 border-t border-[#1c3823]">
                    <StatefulButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setIsRecordIncomeModalOpen(false)
                        resetIncomeForm()
                      }}
                      disabled={incomeFormBusy}
                      className="px-4"
                    >
                      Cancel
                    </StatefulButton>
                    <button
                      type="button"
                      onClick={() => {
                        if (!incomeFormTitle.trim()) {
                          setIncomeFormError('Please enter an income title or source')
                          return
                        }
                        if (!incomeFormAmount || Number(incomeFormAmount) <= 0) {
                          setIncomeFormError('Please enter a valid amount')
                          return
                        }
                        setIncomeStep(2)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-[#0c2838] hover:bg-[#13374d] border border-[#1b4b66] text-xs font-semibold text-[#edf5ea] transition-all touch-manipulation active:scale-[0.98]"
                    >
                      <span>More Details</span>
                      <ArrowRight size={14} className="text-[#38bdf8]" />
                    </button>
                    <StatefulButton
                      type="submit"
                      variant="income"
                      state={incomeFormBusy ? 'loading' : 'idle'}
                      loadingText="Saving…"
                      className="px-5"
                    >
                      Save
                    </StatefulButton>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="income-step-2"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="w-full">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                        Status
                      </label>
                      <Select value={incomeFormStatus} onValueChange={(val) => setIncomeFormStatus(val)}>
                        <SelectTrigger>
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                incomeFormStatus === 'received' ? "bg-[#52e078]" : "bg-[#f59e0b]"
                              )}
                            />
                            <span className="truncate">
                              {incomeFormStatus === 'received' ? 'Received (Deposited)' : 'Pledged (Expected)'}
                            </span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="received">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#52e078]" />
                            <span>Received (Deposited)</span>
                          </SelectItem>
                          <SelectItem value="pledged">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f59e0b]" />
                            <span>Pledged (Expected)</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Input
                      id="income-payer"
                      label="Payer / Sponsor (optional)"
                      type="text"
                      maxLength={200}
                      value={incomeFormPayer}
                      onChange={(val) => setIncomeFormPayer(val)}
                      placeholder="e.g. Dialog Axiata PLC"
                      leftIcon={<Building2 size={15} className="text-[#9db299]" />}
                      classNames={beuiInputStyles}
                    />
                  </div>

                  <Input
                    id="income-receipt-ref"
                    label="Receipt or transaction ref (optional)"
                    type="text"
                    maxLength={100}
                    value={incomeFormReceiptRef}
                    onChange={(val) => setIncomeFormReceiptRef(val)}
                    placeholder="e.g. TXN-SPON-990"
                    leftIcon={<ShieldCheck size={15} className="text-[#9db299]" />}
                    classNames={beuiInputStyles}
                  />

                  <div className="w-full">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#9db299] px-0.5 mb-1.5 block">
                      Note (optional)
                    </label>
                    <div className="relative rounded-xl border border-[#1d3824] bg-[#08150d] p-3 transition-all duration-200 focus-within:border-[#38bdf8] focus-within:ring-2 focus-within:ring-[#38bdf8]/20 hover:border-[#2f5e3b]">
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={incomeFormNotes}
                        onChange={(e) => setIncomeFormNotes(e.target.value)}
                        placeholder="e.g. Platinum sponsor agreement signed, banner placed."
                        className="w-full resize-none bg-transparent text-xs text-[#edf5ea] placeholder:text-[#5d735a] outline-none"
                      />
                    </div>
                  </div>

                  {/* Step 2 Actions */}
                  <div className="flex items-center gap-3 pt-3 border-t border-[#1c3823]">
                    <StatefulButton
                      type="button"
                      variant="secondary"
                      onClick={() => setIncomeStep(1)}
                      disabled={incomeFormBusy}
                      className="px-5 flex items-center gap-1.5"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </StatefulButton>
                    <StatefulButton
                      type="submit"
                      variant="income"
                      state={incomeFormBusy ? 'loading' : 'idle'}
                      loadingText="Saving income…"
                      className="flex-1"
                    >
                      {editingIncome ? 'Update Income' : 'Save Income'}
                    </StatefulButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </MorphingModal>

      {/* 4. Delete External Income Confirmation Morphing Modal */}
      <MorphingModal
        viewId={deleteIncomeId ? 'delete-income-confirm' : null}
        onClose={() => setDeleteIncomeId(null)}
        busy={incomeFormBusy}
        titleId="delete-income-dialog-title"
        className="admin-financial-confirm-wrap"
      >
        <div className="admin-financial-dialog text-left">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#3b1515] border border-[#7f1d1d] text-[#fca5a5]">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 id="delete-income-dialog-title" className="text-lg font-serif font-medium text-[#fca5a5] m-0">
                Delete external income?
              </h3>
              <p className="text-[11px] text-[#d8d3b5] m-0 mt-0.5">
                This removes the income record and deducts the amount from your balance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <StatefulButton
              type="button"
              variant="danger"
              state={incomeFormBusy ? 'loading' : 'idle'}
              loadingText="Deleting…"
              onClick={() => handleDeleteIncome(deleteIncomeId)}
              className="flex-1"
            >
              Delete
            </StatefulButton>
            <StatefulButton
              type="button"
              variant="secondary"
              onClick={() => setDeleteIncomeId(null)}
              disabled={incomeFormBusy}
              className="px-5"
            >
              Cancel
            </StatefulButton>
          </div>
        </div>
      </MorphingModal>
    </FadeContent>
  )
}
