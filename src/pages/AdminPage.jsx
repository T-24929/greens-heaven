import { useEffect, useState } from 'react'
import {
  User,
  Receipt,
  ShieldCheck,
  Clock,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  RotateCcw,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  GraduationCap,
  CircleDollarSign,
} from 'lucide-react'
import { reservationWhatsappLink } from '../lib/admin-messages.js'
import { supabase } from '../utils/supabase.js'

import AdminWorkspace from '../components/admin/AdminWorkspace.jsx'
import ErrorPage from '../components/ErrorPage.jsx'
const TICKET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function scannedTicket() {
  const requested = new URLSearchParams(window.location.search).get('ticket')
  if (TICKET_ID.test(requested || '')) return requested
  try {
    const saved = sessionStorage.getItem('gh-scanned-ticket')
    return TICKET_ID.test(saved || '') ? saved : null
  } catch { return null }
}
const RESERVATION_FIELDS = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,amount_lkr,status,receipt_path,review_note,created_at,updated_at,reviewed_at,reviewed_by,registration_source,payment_method,payment_received_at,payment_received_by,account_setup_sent_at,user_id,registered_by'
const CASH_RESERVATION_FIELDS = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,amount_lkr,status,receipt_path,review_note,created_at,updated_at,reviewed_at,reviewed_by,registration_source,payment_method,payment_received_at,payment_received_by,account_setup_sent_at,user_id'
const LEGACY_RESERVATION_FIELDS = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,amount_lkr,status,receipt_path,review_note,created_at,updated_at,reviewed_at,reviewed_by'
const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  pending_review: 'Payment ready for review',
  approved: 'Approved',
  rejected: 'Needs correction',
}
const PAYMENT_EVENT_LABELS = {
  cash_received: 'Physical cash received',
  cash_approved: 'Cash review approved (legacy)',
  cash_rejected: 'Cash review returned (legacy)',
}

function missingCashSchema(error) {
  return ['PGRST202', 'PGRST204', '42703'].includes(error?.code)
    || /schema cache|column .* does not exist|could not find .*column/i.test(error?.message || '')
}
const EMAIL_LABELS = {
  pending: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  unknown: 'Delivery needs checking',
}

function dateTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
  }).format(new Date(value))
}

function amount(reservation) {
  return `Rs. ${new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(reservation.amount_lkr)}`
}

async function sendEmail(notificationId, notificationType = 'reservation_decision') {
  const setup = notificationType === 'account_setup'
  try {
    const { data, error } = await supabase.functions.invoke(setup ? 'send-account-setup' : 'send-reservation-email', {
      body: { notification_id: notificationId },
    })
    if (error || data?.status !== 'sent') {
      return setup
        ? 'Check the account setup invitation status below before retrying delivery.'
        : 'The review is saved. Check the email status below before retrying delivery.'
    }
    return setup ? 'The account setup invitation has been sent.' : 'The review is saved and the email has been sent.'
  } catch (err) {
    console.warn(`${setup ? 'send-account-setup' : 'send-reservation-email'} edge function call could not be completed:`, err?.message || err)
    return setup ? 'Check the account setup invitation status below.' : 'The review is saved. Check the email delivery status below.'
  }
}

function ReservationDetails({ reservationId, onReview, onClose, adminMap = {}, admins = [], currentAdminId = '' }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadNotice, setLoadNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [step, setStep] = useState('receipt') // 'receipt' | 'info' | 'timeline'
  const [decision, setDecision] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailBusyId, setEmailBusyId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const [receiptBusyId, setReceiptBusyId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [cashCollectorId, setCashCollectorId] = useState('')
  const selectedCashCollectorId = cashCollectorId || currentAdminId

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError('')
      setLoadNotice('')
      try {
        let resRes = await supabase.from('reservations').select(RESERVATION_FIELDS).eq('id', reservationId).maybeSingle()
        let usedCompatibilityFields = false
        if (resRes.error && missingCashSchema(resRes.error)) {
          usedCompatibilityFields = true
          resRes = await supabase.from('reservations').select(CASH_RESERVATION_FIELDS).eq('id', reservationId).maybeSingle()
          if (resRes.error && missingCashSchema(resRes.error)) {
            resRes = await supabase.from('reservations').select(LEGACY_RESERVATION_FIELDS).eq('id', reservationId).maybeSingle()
          }
        }
        const [recRes, revRes, notRes, attRes, payRes] = await Promise.all([
          supabase.from('receipt_submissions').select('id,receipt_path,submitted_at').eq('reservation_id', reservationId).order('submitted_at', { ascending: false }),
          supabase.from('review_history').select('id,decision,note,admin_id,created_at').eq('reservation_id', reservationId).order('created_at', { ascending: false }),
          supabase.from('notification_outbox').select('id,review_id,notification_type,status,attempts,created_at,sent_at,last_error,payload').eq('reservation_id', reservationId).order('created_at', { ascending: false }),
          supabase.from('ticket_attendance').select('gate,checked_in_at').eq('reservation_id', reservationId).order('checked_in_at', { ascending: false }).then(res => res, () => ({ data: [] })),
          supabase.from('payment_events').select('id,event_type,payment_method,amount_lkr,admin_id,note,created_at').eq('reservation_id', reservationId).order('created_at', { ascending: false }).then(res => res, () => ({ data: [] })),
        ])
        if (!active) return
        if (resRes.error || !resRes.data) {
          if (resRes.error) console.error('Failed to load reservation:', resRes.error)
          setDetails(null)
          setLoadError(missingCashSchema(resRes.error) ? 'Cash payment fields are missing from the database. Apply the latest Supabase migrations, then refresh.' : 'Could not load this reservation. Refresh to try again.')
        } else {
          const receipts = recRes.data || []
          setDetails({
            reservation: resRes.data,
            receipts,
            reviews: revRes.data || [],
            emails: notRes.data || [],
            attendance: attRes?.data || [],
            payments: payRes?.data || [],
          })
          if (usedCompatibilityFields) setLoadNotice('Some cash audit fields are not available yet. Apply both cash registration migrations to enable the full payment history.')
          if (receipts[0]?.receipt_path) {
            supabase.storage.from('receipts').createSignedUrl(receipts[0].receipt_path, 300)
              .then(({ data: signed }) => {
                if (active && signed?.signedUrl) {
                  setReceiptLinks(curr => ({ ...curr, [receipts[0].id]: signed.signedUrl }))
                }
              })
              .catch(() => {})
          }
        }
      } catch (err) {
        console.error('Failed to load reservation details:', err)
        if (active) {
          setDetails(null)
          setLoadError('Could not load this reservation. Check connection and try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [reservationId, revision])

  async function openReceipt(receipt) {
    setReceiptBusyId(receipt.id)
    setActionError('')
    try {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(receipt.receipt_path, 300)
      if (error || !data?.signedUrl) throw new Error('Receipt link unavailable')
      setReceiptLinks(current => ({ ...current, [receipt.id]: data.signedUrl }))
    } catch {
      setActionError('Could not create receipt link. Try again.')
    } finally {
      setReceiptBusyId(null)
    }
  }

  async function recordCashReceived() {
    if (busy) return
    if (!selectedCashCollectorId) {
      setActionError('Choose which admin collected the physical cash.')
      return
    }
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      const { error } = await supabase.rpc('record_cash_received', { p_reservation_id: reservationId, p_payment_collector: selectedCashCollectorId })
      if (error) throw error
      setNotice(details?.reservation.registration_source === 'in_person'
        ? 'Physical cash recorded. The ticket is confirmed.'
        : 'Physical cash recorded. The ticket is waiting for organizer approval.')
      setRevision(current => current + 1)
      onReview?.()
    } catch (recordError) {
      setActionError(missingCashSchema(recordError)
        ? 'Cash payment actions are unavailable until the latest Supabase migrations are applied.'
        : recordError?.message || 'Could not record this cash payment. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function review(event) {
    if (event) event.preventDefault()
    if (busy || !decision || details?.reservation.status !== 'pending_review') return
    if (decision === 'rejected' && !reason.trim()) {
      setActionError('Please provide a reason so the attendee knows what to fix.')
      return
    }
    setBusy(true)
    setActionError('')
    setNotice('')
    let saved = false
    try {
      const { data, error } = await supabase.rpc('review_reservation', {
        p_reservation_id: reservationId,
        p_receipt_path: details.reservation.receipt_path,
        p_decision: decision,
        p_note: decision === 'rejected' ? reason.trim() : null,
      })
      if (error) throw error
      if (!data?.reservation) throw new Error('The review response was incomplete. Refresh and check the reservation status.')
      saved = true
      setDecision(null)
      setReason('')
      setNotice(data.notification_id
        ? await sendEmail(data.notification_id)
        : 'Review saved. Email queued for sending.')
    } catch (reviewError) {
      if (saved) setNotice('Review saved. Check email delivery status below.')
      else if (missingCashSchema(reviewError)) setActionError('Payment review is unavailable until the latest Supabase migrations are applied.')
      else if (/different admin/i.test(reviewError?.message || '')) setActionError(reviewError.message)
      else setActionError(reviewError?.message || 'Could not save review. The payment may have already been reviewed.')
    } finally {
      setBusy(false)
      setRevision(current => current + 1)
      onReview?.()
    }
  }

  async function retryEmail(email) {
    if (emailBusyId || busy) return
    setEmailBusyId(email.id)
    setActionError('')
    setNotice('')
    try {
      setNotice(await sendEmail(email.id, email.notification_type))
    } catch {
      setActionError('The email request did not finish. Refresh status before retrying.')
    } finally {
      setEmailBusyId(null)
      setRevision(current => current + 1)
    }
  }

  async function copyReference(ref) {
    try {
      await navigator.clipboard.writeText(ref)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard error
    }
  }

  const reservation = details?.reservation
  const whatsappUrl = reservationWhatsappLink(reservation)
  const cashPayment = reservation?.payment_method === 'cash'
  const cashRegistration = reservation?.registration_source === 'in_person' && cashPayment
  const canRecordCash = ['awaiting_payment', 'rejected'].includes(reservation?.status)
    && (cashRegistration || reservation?.registration_source === 'online')
  const currentApprovalReview = details?.reviews?.find(review => review.decision === 'approved'
    && review.created_at === reservation?.reviewed_at)
  const ticketEmailBlocked = reservation?.status === 'approved' && details?.emails?.some(email => {
    if (email.notification_type === 'account_setup' || !['pending', 'sending', 'unknown'].includes(email.status)
      || email.payload?.status !== 'approved') return false
    if (email.notification_type === 'ticket_resend') {
      const approvalAt = email.payload?.approval_at
      return approvalAt == null
        ? reservation.reviewed_at == null
        : Date.parse(approvalAt) === Date.parse(reservation.reviewed_at)
    }
    return Boolean(currentApprovalReview && email.review_id === currentApprovalReview.id)
  })

  async function resendTicket() {
    if (emailBusyId || busy || ticketEmailBlocked || reservation?.status !== 'approved') return
    setEmailBusyId('ticket-resend')
    setActionError('')
    setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('send-reservation-email', {
        body: { reservation_id: reservation.id, resend: true },
      })
      if (error || data?.status !== 'sent') {
        setActionError(data?.error || 'The ticket could not be resent. Check delivery updates and try again.')
      } else {
        setNotice(`Ticket resent to ${reservation.email}.`)
      }
    } catch {
      setActionError('The resend request could not be confirmed. Check delivery updates before trying again.')
    } finally {
      setEmailBusyId(null)
      setRevision(current => current + 1)
    }
  }

  const steps = [
    { id: 'receipt', label: cashPayment ? 'Payment' : 'Slip', icon: cashPayment ? CircleDollarSign : Receipt, badge: reservation?.status === 'pending_review' },
    { id: 'info', label: 'Details', icon: User },
    { id: 'timeline', label: 'Logs', icon: Clock },
  ]

  return (
    <div className="admin-drawer-container">
      {/* Drawer Header */}
      <div className="admin-drawer-header">
        <h2 id="reservation-detail-heading" className="admin-drawer-title">
          Member profile
        </h2>
        <div className="admin-drawer-header-actions">
          <button
            type="button"
            className="admin-dialog-icon-btn"
            onClick={() => setRevision(r => r + 1)}
            disabled={loading || busy}
            title="Refresh details"
            aria-label="Refresh reservation"
          >
            <RefreshCw size={15} className={loading || busy ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              type="button"
              className="admin-drawer-close-btn"
              onClick={onClose}
              title="Close profile"
              aria-label="Close reservation profile"
            >
              <X size={17} />
            </button>
          )}
        </div>
      </div>

      {loadError && <p className="notice notice-error" role="alert">{loadError}</p>}
      {loadNotice && <p className="notice notice-warning" role="status">{loadNotice}</p>}
      {actionError && <p className="notice notice-error" role="alert">{actionError}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}

      {loading ? (
        <div className="py-16 text-center text-sm text-[#9ab092]">Loading member profile…</div>
      ) : reservation ? (
        <div className="space-y-4">
          {/* Profile Hero matching Image 3 */}
          <div className="admin-profile-hero">
            <div className="admin-hero-avatar">
              {reservation.full_name?.trim().charAt(0) || 'M'}
            </div>
            <div className="admin-hero-info">
              <h3 className="admin-hero-name">{reservation.full_name}</h3>
              <div className="admin-hero-meta">
                <button
                  type="button"
                  className="admin-hero-ref"
                  onClick={() => copyReference(reservation.reference)}
                  title="Click to copy ticket reference"
                >
                  <span>{reservation.reference}</span>
                  {copied ? <Check size={11} className="text-[#64e082] ml-1 inline" /> : <Copy size={11} className="text-[#849a7e] ml-1 inline" />}
                </button>
                <span>·</span>
                <span className={`admin-status-dot-badge ${reservation.status}`}>
                  <span className="admin-dot" />
                  <span>{STATUS_LABELS[reservation.status] || reservation.status}</span>
                </span>
              </div>
            </div>
          </div>

          {/* WhatsApp Share Card matching Image 3 */}
          {whatsappUrl && (
            <div className="admin-share-section">
              <span className="admin-share-label">Share approval</span>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="admin-whatsapp-btn-full"
              >
                <MessageCircle size={18} />
                <span>Open WhatsApp</span>
                <ExternalLink size={14} className="opacity-70 ml-0.5" />
              </a>
            </div>
          )}

          {/* Official Payment Receipt Card matching Image 3 */}
          <div className="admin-receipt-official-card">
            <div className="admin-receipt-card-header">
                {cashPayment ? (
                  <span className={`admin-receipt-status-pill ${reservation.status === 'approved' ? 'paid' : reservation.status === 'pending_review' ? 'pending' : reservation.status === 'rejected' ? 'needs_fix' : 'awaiting'}`}>
                    {reservation.status === 'approved' ? <><Check size={12} />CASH CONFIRMED</>
                      : reservation.status === 'pending_review' ? <><Clock size={12} />CASH RECORDED</>
                        : reservation.status === 'rejected' ? <><AlertCircle size={12} />CASH NEEDS FIX</>
                          : <><Clock size={12} />PHYSICAL CASH DUE</>}
                  </span>
                ) : reservation.status === 'approved' ? (
                <span className="admin-receipt-status-pill paid">
                  <Check size={12} /> PAID
                </span>
              ) : reservation.status === 'pending_review' ? (
                <span className="admin-receipt-status-pill pending">
                  <Clock size={12} /> PENDING
                </span>
              ) : reservation.status === 'rejected' ? (
                <span className="admin-receipt-status-pill needs_fix">
                  <AlertCircle size={12} /> CORRECTION NEEDED
                </span>
              ) : (
                <span className="admin-receipt-status-pill awaiting">
                  <Clock size={12} /> AWAITING RECEIPT
                </span>
              )}
              <span className="admin-receipt-form-no">
                Form 0012 · {reservation.reference}
              </span>
            </div>

            <div className="admin-receipt-title-group">
              <h4 className="admin-receipt-card-title">
              {cashRegistration ? 'Physical cash registration' : cashPayment ? 'Physical cash payment' : 'Ticket reservation fee received (2026)'}
              </h4>
              <span className="admin-receipt-card-sub">
                {cashPayment
                  ? reservation.status === 'approved'
                    ? `Physical cash collected by ${adminMap[reservation.payment_received_by] || 'organizer'} · ticket confirmed`
                      : reservation.status === 'pending_review'
                      ? `Physical cash collected by ${adminMap[reservation.payment_received_by] || 'admin'} · awaiting organizer review`
                      : reservation.status === 'rejected'
                        ? `Physical cash record needs attention${reservation.review_note ? `: ${reservation.review_note}` : ''}`
                        : `Registration entered by ${adminMap[reservation.registered_by] || 'admin not recorded'} · payment due`
                  : reservation.status === 'approved'
                    ? `Confirmed on ${new Date(details.reviews?.[0]?.created_at || reservation.updated_at || reservation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Gate Pass Active`
                    : `Reserved on ${new Date(reservation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Single Admission`}
              </span>
            </div>

            <div className="admin-receipt-official-grid">
              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Name</span>
                <strong className="admin-cell-value" title={reservation.full_name}>
                  {reservation.full_name}
                </strong>
              </div>
              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Member ID</span>
                <strong className="admin-cell-value font-mono">
                  {reservation.reference}
                </strong>
              </div>
              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Fee amount</span>
                <strong className="admin-cell-value admin-fee-highlight">
                  {amount(reservation)}
                </strong>
              </div>

              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Fee received</span>
                <strong className="admin-cell-value">
                  {cashPayment
                    ? reservation.status === 'awaiting_payment' ? 'Not recorded yet' : reservation.status === 'pending_review' ? 'Received' : reservation.status === 'approved' ? 'Received · confirmed' : 'Received · correction needed'
                    : reservation.status === 'approved' ? 'Yes (Bank Slip)' : reservation.status === 'pending_review' ? 'Slip Uploaded' : 'Pending'}
                </strong>
              </div>
              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Joined date</span>
                <strong className="admin-cell-value">
                  {new Date(reservation.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </strong>
              </div>
              <div className="admin-receipt-cell">
                <span className="admin-cell-label">Admission No</span>
                <strong className="admin-cell-value">
                  {reservation.school_index_number || (reservation.nic_number ? reservation.nic_number.slice(0, 9) : '—')}
                </strong>
              </div>
            </div>

            <div className="admin-receipt-card-footer">
              <ShieldCheck size={13} className="text-[#52e078]" />
              <span>
                {cashRegistration
                  ? `Entered by ${adminMap[reservation.registered_by] || 'admin not recorded'} · ${reservation.payment_received_by ? `physical cash collected by ${adminMap[reservation.payment_received_by] || 'admin'}` : 'payment not collected yet'}`
                  : cashPayment
                    ? `Physical cash collected by ${adminMap[reservation.payment_received_by] || 'admin'}${reservation.reviewed_by ? ` · reviewed by ${adminMap[reservation.reviewed_by] || 'admin'}` : ' · awaiting organizer review'}`
                  : reservation.status === 'approved' && (adminMap[reservation.reviewed_by] || reservation.reviewed_by)
                    ? `Approved by: ${adminMap[reservation.reviewed_by] || reservation.reviewed_by}`
                    : reservation.status === 'approved'
                      ? 'Approved by: Organizer Admin'
                      : reservation.status === 'rejected' && (adminMap[reservation.reviewed_by] || reservation.reviewed_by)
                        ? `Reviewed by: ${adminMap[reservation.reviewed_by] || reservation.reviewed_by}`
                        : 'Processed by: Organizer Desk · Single Gate Pass'}
              </span>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <nav className="admin-drawer-subtabs" role="tablist" aria-label="Reservation sections">
            {steps.map((s) => {
              const Icon = s.icon
              const isActive = step === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`admin-drawer-subtab ${isActive ? 'active' : ''}`}
                  onClick={() => setStep(s.id)}
                >
                  <Icon size={12} className="inline mr-1.5" />
                  <span>{s.label}</span>
                  {s.badge && <span className="admin-stepper-dot ml-1.5 inline-block" aria-label="Action required" />}
                </button>
              )
            })}
          </nav>

          {/* Tab 1: Slip & Verification */}
          {step === 'receipt' && (
            <div className="space-y-3">
              {canRecordCash && (
                <div className="rounded-xl border border-[#24432d] bg-[#0b1710] p-3.5">
                  <strong className="block text-sm text-[#e2eadd]">
                    {reservation.status === 'rejected' && cashPayment ? 'Cash record needs attention' : reservation.status === 'rejected' ? 'Payment needs attention' : cashPayment ? 'Cash has not been recorded' : 'Record a physical cash payment'}
                  </strong>
                  <p className="mt-1 text-xs text-[#9eb598]">
                    {cashRegistration
                      ? reservation.status === 'rejected'
                        ? 'After checking the record, select the admin who collected the physical cash.'
                        : `Record ${amount(reservation)} when payment is collected. The ticket will be confirmed when you save it.`
                      : reservation.status === 'rejected' && cashPayment
                        ? 'Check the organizer’s note. Record cash again only if a new physical payment was collected.'
                        : 'If the attendee paid in person, record who collected the cash. The ticket will wait for organizer approval.'}
                  </p>
                  {reservation.status === 'rejected' && reservation.review_note && <p className="mt-2 text-xs text-[#f0b3a7]">Review note: {reservation.review_note}</p>}
                  <label className="reserve-field admin-cash-collector-field mt-3"><span>Physical cash collected by</span><select value={selectedCashCollectorId} onChange={event => setCashCollectorId(event.target.value)} disabled={busy} required><option value="">Choose admin</option>{currentAdminId && !admins.some(admin => (admin.user_id || admin.id) === currentAdminId) && <option value={currentAdminId}>You</option>}{admins.map(admin => { const id = admin.user_id || admin.id; return id ? <option value={id} key={id}>{id === currentAdminId ? `${admin.full_name || admin.email || 'Admin'} (you)` : admin.full_name || admin.email || 'Admin'}</option> : null })}</select></label>
                  <button type="button" className="admin-button primary mt-3 w-full justify-center text-xs" onClick={recordCashReceived} disabled={busy}>
                    <CircleDollarSign size={15} />{busy ? 'Saving payment…' : reservation.status === 'rejected' && cashPayment ? 'Record new cash payment' : reservation.status === 'rejected' ? 'Record physical cash' : 'Confirm cash received'}
                  </button>
                </div>
              )}
              {/* Review Decision Box for pending_review */}
              {reservation.status === 'pending_review' && !cashRegistration && (
                <div className="admin-review-box">
                  {!decision ? (
                    <div className="space-y-2.5">
                      <div className="p-3 rounded-xl bg-[#0b190f] border border-[#1f3624] text-center">
                        <span className="text-xs text-[#9eb598] block">{cashPayment ? 'Review physical cash payment' : 'Review payment slip'}</span>
                        <strong className="text-sm text-[#e2eadd]">
                          {cashPayment
                            ? `Confirm ${amount(reservation)} physical cash for ${reservation.full_name}`
                            : `Verify ${amount(reservation)} deposit for ${reservation.full_name}`}
                        </strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="admin-button primary py-2.5 text-center justify-center font-semibold text-xs"
                          onClick={() => setDecision('approved')}
                          disabled={busy}
                        >
                          <CheckCircle2 size={15} />
                          <span>{cashPayment ? 'Approve cash' : 'Approve'}</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button py-2.5 text-center justify-center border-[#7d4838] text-[#f7bbb0] hover:bg-[#2e1914] text-xs"
                          onClick={() => setDecision('rejected')}
                          disabled={busy}
                        >
                          <AlertCircle size={15} />
                          <span>{cashPayment ? 'Reject cash' : 'Needs Fix'}</span>
                        </button>
                      </div>
                    </div>
                  ) : decision === 'approved' ? (
                    <div className="admin-inline-confirm-card approve">
                      <h4>Confirm {amount(reservation)} {cashPayment ? 'cash payment' : 'payment'} for {reservation.full_name}?</h4>
                      <p>Issues QR ticket and sends confirmation email.</p>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          className="admin-button primary flex-1 text-xs"
                          onClick={review}
                          disabled={busy}
                        >
                          {busy ? 'Approving…' : 'Confirm Approval'}
                        </button>
                        <button
                          type="button"
                          className="admin-button text-xs"
                          onClick={() => setDecision(null)}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-inline-confirm-card reject">
                      <h4>{cashPayment ? 'Reject cash record' : 'Request slip correction'}</h4>
                      <p>{cashPayment ? 'Explain what needs correcting. Ask the attendee to contact the organizers before making another payment:' : 'Explain what is missing or illegible so the attendee can re-upload:'}</p>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={cashPayment ? 'e.g. Amount or collector details need checking' : 'e.g. Transaction reference or bank seal is not legible'}
                        rows={3}
                        maxLength={500}
                        className="admin-reason-textarea"
                        disabled={busy}
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          type="button"
                          className="admin-button flex-1 bg-[#47221a] text-[#f7bbb0] border-[#7d4032] hover:bg-[#592b21] text-xs"
                          onClick={review}
                          disabled={busy || !reason.trim()}
                        >
                          {busy ? 'Saving…' : cashPayment ? 'Send for correction' : 'Send Correction Note'}
                        </button>
                        <button
                          type="button"
                          className="admin-button text-xs"
                          onClick={() => {
                            setDecision(null)
                            setReason('')
                          }}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Status banner when not pending */}
              {reservation.status === 'approved' && (
                <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-[#0f2416] border border-[#275330]">
                  <CheckCircle2 size={20} className="text-[#64e082] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <strong className="text-sm text-[#d8e5cd] block">Confirmed & Admitted</strong>
                    <p className="text-xs text-[#a2b89d]">Ticket QR is active and valid for gate check-in.</p>
                  </div>
                  <button
                    type="button"
                    className="admin-button py-2 px-3 text-xs"
                    onClick={resendTicket}
                    disabled={Boolean(emailBusyId) || busy || ticketEmailBlocked}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {emailBusyId === 'ticket-resend' ? 'Sending…' : 'Resend ticket'}
                  </button>
                  {ticketEmailBlocked && <p className="basis-full text-xs text-[#b7c4a8]">A ticket email is pending or its delivery needs checking. Refresh delivery updates before resending.</p>}
                </div>
              )}
              {reservation.status === 'rejected' && !cashPayment && (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#261511] border border-[#593026]">
                  <AlertCircle size={18} className="text-[#f5a796] shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm text-[#f5a796] block">Needs Slip Correction</strong>
                    <p className="text-xs text-[#d2ab9f] mt-1">
                      {details.reviews?.[0]?.note || 'Awaiting replacement receipt from attendee.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Uploaded Receipts */}
              {!cashRegistration && (details.receipts.length === 0 ? (
                <div className="admin-empty-card">
                  <Receipt size={26} className="mx-auto text-[#4d6951] mb-2" />
                  <p className="text-xs text-[#9eb598]">{cashPayment ? 'No bank receipt was uploaded for this cash payment.' : 'No payment slip uploaded yet.'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {details.receipts.map((receipt, index) => {
                    const isLatest = index === 0
                    const signedUrl = receiptLinks[receipt.id]
                    const isBusy = receiptBusyId === receipt.id
                    return (
                      <div key={receipt.id} className="admin-receipt-card">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#9eb598] mb-2">
                          <span className="font-medium text-[#d8e5cd]">
                            {cashPayment ? 'Previous bank receipt' : `Receipt ${details.receipts.length - index}`} {isLatest && <span className="text-[#7ce698] font-semibold">(Latest)</span>}
                          </span>
                          <span className="text-xs text-[#8ea488]">{dateTime(receipt.submitted_at)}</span>
                        </div>

                        {signedUrl ? (
                          <div className="space-y-2">
                            <div className="admin-receipt-preview-wrap">
                              <img
                                src={signedUrl}
                                alt="Payment receipt slip"
                                className="admin-receipt-img"
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'
                                }}
                              />
                              <div style={{ display: 'none' }} className="p-4 text-center text-xs text-[#8ea488]">
                                Preview unavailable inline. Open full file below.
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-button primary flex-1 text-xs"
                              >
                                <ExternalLink size={13} />
                                <span>Open Full Size</span>
                              </a>
                              <button
                                type="button"
                                className="admin-button text-xs"
                                onClick={() => openReceipt(receipt)}
                                disabled={isBusy}
                                title="Get a new 5-minute image link"
                              >
                                <RotateCcw size={13} />
                                <span>Refresh link</span>
                              </button>
                            </div>
                            <p className="text-[10px] text-[#789074] text-center mt-1">Links expire after 5 minutes for privacy.</p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="admin-button primary w-full text-xs"
                            onClick={() => openReceipt(receipt)}
                            disabled={isBusy}
                          >
                            <Receipt size={14} />
                            <span>{isBusy ? 'Loading link…' : 'Load Receipt Slip'}</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Attendee & School Information */}
          {step === 'info' && (
            <div className="space-y-3">
              {(cashRegistration ? (reservation.registered_by || reservation.payment_received_by) : cashPayment ? (reservation.payment_received_by || reservation.reviewed_at) : reservation.reviewed_at) && (
                <div className="admin-table-card">
                  <div className="admin-table-card-header">
                    <ShieldCheck size={13} />
                    <span>{reservation.payment_method === 'cash' ? 'Physical cash audit' : 'Review &amp; Verification'}</span>
                  </div>
                  <table className="admin-kv-table">
                    <tbody>
                      {cashRegistration && <tr>
                        <th scope="row">Entered by</th>
                        <td><strong className="text-[#e2eadd]">{adminMap[reservation.registered_by] || (reservation.registered_by ? `Admin (${reservation.registered_by.slice(0, 8)}…)` : 'Not recorded')}</strong></td>
                      </tr>}
                      <tr>
                        <th scope="row">{reservation.payment_method === 'cash' ? 'Physical cash collected by' : 'Reviewed By'}</th>
                        <td>
                          <strong className="text-[#e2eadd]">
                            {reservation.payment_method === 'cash'
                              ? reservation.payment_received_by ? adminMap[reservation.payment_received_by] || `Admin (${reservation.payment_received_by.slice(0, 8)}…)` : 'Not collected'
                              : adminMap[reservation.reviewed_by] || (reservation.reviewed_by ? `Admin (${reservation.reviewed_by.slice(0, 8)}…)` : 'Organizer Admin')}
                          </strong>
                        </td>
                      </tr>
                      {reservation.payment_method === 'cash' && <>
                        <tr><th scope="row">Payment</th><td><strong className="text-[#64e082]">Physical cash · {amount(reservation)}</strong></td></tr>
                        <tr><th scope="row">Received at</th><td className="text-xs text-[#a2b59d]">{reservation.payment_received_at ? dateTime(reservation.payment_received_at) : 'Not collected'}</td></tr>
                        {cashPayment && !cashRegistration && <tr><th scope="row">Reviewed by</th><td><strong className="text-[#e2eadd]">{adminMap[reservation.reviewed_by] || (reservation.reviewed_by ? `Admin (${reservation.reviewed_by.slice(0, 8)}…)` : 'Not reviewed')}</strong></td></tr>}
                      </>}
                      <tr>
                        <th scope="row">Outcome</th>
                        <td>
                          <span className={`admin-status-dot-badge ${reservation.status}`}>
                            <span className="admin-dot" />
                            <span>{STATUS_LABELS[reservation.status] || reservation.status}</span>
                          </span>
                        </td>
                      </tr>
                      {!cashRegistration && <tr>
                        <th scope="row">Review Date</th>
                        <td className="text-xs text-[#a2b59d]">{reservation.reviewed_at ? dateTime(reservation.reviewed_at) : 'Not reviewed'}</td>
                      </tr>}
                      {reservation.review_note && (
                        <tr>
                          <th scope="row">Review Note</th>
                          <td className="text-xs text-[#f5a898]">{reservation.review_note}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="admin-table-card">
                <div className="admin-table-card-header">
                  <User size={13} />
                  <span>Contact Information</span>
                </div>
                <table className="admin-kv-table">
                  <tbody>
                    <tr>
                      <th scope="row">WhatsApp</th>
                      <td>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[#d8e5cd]">{reservation.whatsapp}</span>
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="admin-mini-link"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle size={11} />
                              <span>Chat</span>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Email</th>
                      <td>
                        <a href={`mailto:${reservation.email}`} className="text-[#c0d8b0] hover:underline truncate block">
                          {reservation.email}
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Reserved</th>
                      <td className="text-xs text-[#a2b59d]">{dateTime(reservation.created_at)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Registration</th>
                      <td>{reservation.registration_source === 'in_person' ? 'In person · physical cash' : 'Online'}</td>
                    </tr>
                    <tr>
                      <th scope="row">Account</th>
                      <td>{reservation.user_id ? 'Linked to attendee account' : reservation.account_setup_sent_at ? `Setup email sent ${dateTime(reservation.account_setup_sent_at)}` : 'Not claimed yet'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="admin-table-card">
                <div className="admin-table-card-header">
                  <GraduationCap size={13} />
                  <span>School & Identity</span>
                </div>
                <table className="admin-kv-table">
                  <tbody>
                    <tr>
                      <th scope="row">NIC Number</th>
                      <td>
                        <span className="font-mono text-[#d8e5cd]">{reservation.nic_number || 'Not provided'}</span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">School Index</th>
                      <td>
                        <span className="font-mono text-[#d8e5cd]">{reservation.school_index_number || 'Not provided'}</span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Joined Year</th>
                      <td>{reservation.school_joined_year || 'Not provided'}</td>
                    </tr>
                    <tr>
                      <th scope="row">Ticket Type</th>
                      <td><span className="admin-tag">Single Admission</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Gate & Delivery Logs */}
          {step === 'timeline' && (
            <div className="space-y-3">
              {details.payments?.length > 0 && <div className="admin-table-card">
                <div className="admin-table-card-header"><CircleDollarSign size={13} /><span>Payment audit</span></div>
                <table className="admin-table-grid"><thead><tr><th>Payment activity</th><th>Admin</th><th>Amount</th><th>Time</th></tr></thead>
                  <tbody>{details.payments.map(payment => <tr key={payment.id}>
                    <td className="font-medium text-[#d8e5cd]">{PAYMENT_EVENT_LABELS[payment.event_type] || payment.event_type}</td>
                    <td className="text-xs text-[#e2eadd]">{adminMap[payment.admin_id] || (payment.admin_id ? `Admin (${payment.admin_id.slice(0, 8)}…)` : 'Admin')}</td>
                    <td className="text-xs text-[#64e082]">{amount({ amount_lkr: payment.amount_lkr })}</td>
                    <td className="text-xs text-[#8ea488]">{dateTime(payment.created_at)}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
              <div className="admin-table-card">
                <div className="admin-table-card-header">
                  <ShieldCheck size={13} />
                  <span>Gate Check-ins</span>
                </div>
                <table className="admin-table-grid">
                  <thead>
                    <tr>
                      <th>Gate Station</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['entrance', 'photobooth'].map((gateKey) => {
                      const record = details.attendance?.find((a) => a.gate === gateKey)
                      const label = gateKey === 'entrance' ? 'Gate 01 · Entrance' : 'Gate 02 · Photo Booth'
                      return (
                        <tr key={gateKey}>
                          <td className="font-medium text-[#d8e5cd]">{label}</td>
                          <td>
                            {record ? (
                              <span className="admin-badge approved">Checked In</span>
                            ) : (
                              <span className="admin-badge awaiting_payment">Pending</span>
                            )}
                          </td>
                          <td className="text-xs text-[#8ea488]">
                            {record
                              ? new Date(record.checked_in_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="admin-table-card">
                <div className="admin-table-card-header">
                  <Clock size={13} />
                  <span>Email Notifications</span>
                </div>
                {details.emails.length === 0 ? (
                  <p className="p-3 text-xs text-[#8ea488]">No emails queued yet.</p>
                ) : (
                  <table className="admin-table-grid">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Sent Time</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.emails.map((email) => (
                        <tr key={email.id}>
                          <td className="text-xs text-[#c8d8c2]">{email.notification_type === 'account_setup' ? 'Account setup' : 'Ticket update'}</td>
                          <td>
                            <span className={`admin-badge ${email.status}`}>
                              {EMAIL_LABELS[email.status] || email.status}
                            </span>
                            {email.last_error && <small className="admin-outbox-error">{email.last_error}</small>}
                          </td>
                          <td className="text-xs text-[#8ea488]">
                            {dateTime(email.sent_at || email.created_at)}
                          </td>
                          <td>
                            {['pending', 'failed'].includes(email.status) && email.attempts < 5 ? (
                              <button
                                type="button"
                                className="admin-mini-btn"
                                onClick={() => retryEmail(email)}
                                disabled={Boolean(emailBusyId) || busy}
                              >
                                {emailBusyId === email.id ? 'Sending…' : 'Retry'}
                              </button>
                            ) : (
                              <span className="text-xs text-[#6e856b]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {details.reviews.length > 0 && (
                <div className="admin-table-card">
                  <div className="admin-table-card-header">
                    <CheckCircle2 size={13} />
                    <span>Review Audit History</span>
                  </div>
                  <table className="admin-table-grid">
                    <thead>
                      <tr>
                        <th>Decision</th>
                        <th>Reviewed By</th>
                        <th>Note</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.reviews.map((rev) => (
                        <tr key={rev.id}>
                          <td>
                            <span className={rev.decision === 'approved' ? 'text-[#64e082] font-semibold text-xs' : 'text-[#f5a796] font-semibold text-xs'}>
                              {rev.decision === 'approved' ? 'Approved' : 'Needs Fix'}
                            </span>
                          </td>
                          <td className="text-xs text-[#e2eadd]">
                            {adminMap[rev.admin_id] || (rev.admin_id ? `Admin (${rev.admin_id.slice(0, 8)}…)` : 'Admin')}
                          </td>
                          <td className="text-xs text-[#b4c8af] italic max-w-[160px] truncate">
                            {rev.note || '—'}
                          </td>
                          <td className="text-xs text-[#8ea488]">
                            {dateTime(rev.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Drawer Bottom Dock */}
          <div className="admin-drawer-dock">
            <button
              type="button"
              className="admin-button text-xs"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="admin-button text-xs"
              onClick={() => setRevision(r => r + 1)}
              disabled={loading || busy}
            >
              <RefreshCw size={13} className={loading || busy ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function AdminPage({ user, currentPath }) {
  const [access, setAccess] = useState({ userId: null, allowed: false, error: '' })
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('ticket')
    if (!user && TICKET_ID.test(requested || '')) {
      try { sessionStorage.setItem('gh-scanned-ticket', requested) } catch { /* Re-scan after signing in if storage is unavailable. */ }
    }
  }, [user])

  useEffect(() => {
    if (!user?.id || !supabase) return
    let active = true
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (active) setAccess({ userId: user.id, allowed: data === true && !error, error: error ? 'Could not check admin access. Try again.' : '' })
    }).catch(() => {
      if (active) setAccess({ userId: user.id, allowed: false, error: 'Could not check admin access. Try again.' })
    })
    return () => { active = false }
  }, [user?.id, revision])

  useEffect(() => {
    const handleRefresh = () => setRevision(current => current + 1)
    window.addEventListener('admin:refresh', handleRefresh)
    return () => window.removeEventListener('admin:refresh', handleRefresh)
  }, [])

  if (!supabase) return <ErrorPage status={503} description="The organizer workspace is not connected right now. Return to the event while the setup is completed." primaryAction={{ label: 'Back to the event', href: '/' }} secondaryAction={null} />
  if (!user) return <ErrorPage status={401} />
  if (access.userId !== user.id) return <p role="status">Checking admin access…</p>
  if (access.error) return <ErrorPage status={503} description={access.error} primaryAction={{ label: 'Try again', onClick: () => setRevision(current => current + 1) }} />
  if (!access.allowed) return <ErrorPage status={403} primaryAction={{ label: 'Check admin access again', onClick: () => setRevision(current => current + 1) }} />
  return <AdminWorkspace key={user.id} Detail={ReservationDetails} initialTicket={scannedTicket()} currentPath={currentPath} currentAdminId={user.id} />
}
