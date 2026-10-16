import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button.jsx'
import { reservationWhatsappLink } from '../lib/admin-messages.js'
import { supabase } from '../utils/supabase.js'

import AdminWorkspace from '../components/admin/AdminWorkspace.jsx'
import ErrorPage from '../components/ErrorPage.jsx'
import { MorphingModal } from '../components/motion/morphing-modal.jsx'
const TICKET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function scannedTicket() {
  const requested = new URLSearchParams(window.location.search).get('ticket')
  if (TICKET_ID.test(requested || '')) return requested
  try {
    const saved = sessionStorage.getItem('gh-scanned-ticket')
    return TICKET_ID.test(saved || '') ? saved : null
  } catch { return null }
}
const RESERVATION_FIELDS = 'id,reference,full_name,email,whatsapp,nic_number,school_index_number,school_joined_year,amount_lkr,status,receipt_path,review_note,created_at,updated_at,reviewed_at'
const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  pending_review: 'Ready for review',
  approved: 'Approved',
  rejected: 'Replacement receipt needed',
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

async function sendEmail(notificationId) {
  const { data, error } = await supabase.functions.invoke('send-reservation-email', {
    body: { notification_id: notificationId },
  })
  if (error || data?.status !== 'sent') {
    return 'The review is saved. Check the email status below before retrying delivery.'
  }
  return 'The review is saved and the email has been sent.'
}

function ReservationDetails({ reservationId, onReview }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [decision, setDecision] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [emailBusyId, setEmailBusyId] = useState(null)
  const [receiptLinks, setReceiptLinks] = useState({})
  const [receiptBusyId, setReceiptBusyId] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setLoadError('')
      const results = await Promise.all([
        supabase.from('reservations').select(RESERVATION_FIELDS).eq('id', reservationId).maybeSingle(),
        supabase.from('receipt_submissions').select('id,receipt_path,submitted_at').eq('reservation_id', reservationId).order('submitted_at', { ascending: false }),
        supabase.from('review_history').select('id,decision,note,created_at').eq('reservation_id', reservationId).order('created_at', { ascending: false }),
        supabase.from('notification_outbox').select('id,review_id,status,attempts,created_at,sent_at').eq('reservation_id', reservationId).order('created_at', { ascending: false }),
      ])
      if (!active) return
      if (results.some(result => result.error) || !results[0].data) {
        setDetails(null)
        setLoadError('Could not load this reservation. Refresh to try again.')
      } else {
        setDetails({ reservation: results[0].data, receipts: results[1].data, reviews: results[2].data, emails: results[3].data })
      }
      setLoading(false)
    }
    load().catch(() => {
      if (active) {
        setDetails(null)
        setLoadError('Could not load this reservation. Check your connection and try again.')
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [reservationId, revision])

  async function openReceipt(receipt) {
    setReceiptBusyId(receipt.id)
    setActionError('')
    try {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(receipt.receipt_path, 60)
      if (error || !data?.signedUrl) throw new Error('Receipt link unavailable')
      setReceiptLinks(current => ({ ...current, [receipt.id]: data.signedUrl }))
    } catch {
      setActionError('Could not create a receipt link. Try again.')
    } finally {
      setReceiptBusyId(null)
    }
  }

  async function review(event) {
    event.preventDefault()
    if (busy || !decision || details?.reservation.status !== 'pending_review') return
    if (decision === 'rejected' && !reason.trim()) {
      setActionError('Give a reason so the attendee knows what to fix.')
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
      if (error || !data?.reservation) throw new Error('Review failed')
      saved = true
      setDecision(null)
      setReason('')
      setNotice(data.notification_id
        ? await sendEmail(data.notification_id)
        : 'The review is saved. The email has not been sent. Check the delivery list below.')
    } catch {
      if (saved) setNotice('The review is saved. The email request did not finish. Check the delivery status below.')
      else setActionError('Could not save the review. Another admin may have already reviewed this receipt. The latest details have been loaded below.')
    } finally {
      setBusy(false)
      setRevision(current => current + 1)
      onReview()
    }
  }

  async function retryEmail(email) {
    if (emailBusyId || busy) return
    setEmailBusyId(email.id)
    setActionError('')
    setNotice('')
    try {
      setNotice(await sendEmail(email.id))
    } catch {
      setActionError('The email request did not finish. Refresh the delivery status before retrying.')
    } finally {
      setEmailBusyId(null)
      setRevision(current => current + 1)
    }
  }

  const reservation = details?.reservation
  const whatsappUrl = reservationWhatsappLink(reservation)

  return (
    <section className="panel stack" aria-labelledby="reservation-detail-heading" aria-busy={loading || busy}>
      <div className="row">
        <h2 id="reservation-detail-heading">Reservation details</h2>
        <Button variant="outline" onClick={() => setRevision(current => current + 1)} disabled={loading || busy || Boolean(emailBusyId)}>Refresh details</Button>
      </div>
      {loadError && <p className="notice notice-error" role="alert">{loadError}</p>}
      {actionError && <p className="notice notice-error" role="alert">{actionError}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading && <p className="muted" role="status">Loading reservation…</p>}
      {!loading && reservation && <>
        <div>
          <h3>{reservation.full_name}</h3>
          <p className="muted">{reservation.reference}</p>
          <p><span className="badge">{STATUS_LABELS[reservation.status]}</span></p>
        </div>
        <dl className="stack">
          <div><dt>Email</dt><dd className="break-words">{reservation.email}</dd></div>
          <div><dt>WhatsApp</dt><dd>{reservation.whatsapp}</dd></div>
          <div><dt>NIC</dt><dd>{reservation.nic_number || 'Not provided'}</dd></div>
          <div><dt>School index</dt><dd>{reservation.school_index_number || 'Not provided'}</dd></div>
          <div><dt>Year joined Isipathana</dt><dd>{reservation.school_joined_year || 'Not provided'}</dd></div>
          <div><dt>Ticket price</dt><dd>{amount(reservation)}</dd></div>
          <div><dt>Reserved</dt><dd>{dateTime(reservation.created_at)} (Sri Lanka)</dd></div>
        </dl>

        <div className="stack">
          <h3>Payment receipts</h3>
          <p className="muted">Check the amount, account and transaction reference against the bank record before approving.</p>
          {details.receipts.length === 0 && <p className="muted">No receipt uploaded yet.</p>}
          <ul className="stack">
            {details.receipts.map((receipt, index) => <li key={receipt.id} className="stack">
              <p>Receipt {details.receipts.length - index}{index === 0 ? ' · latest' : ''} · {dateTime(receipt.submitted_at)}</p>
              <div className="row">
                <Button variant="outline" onClick={() => openReceipt(receipt)} disabled={Boolean(receiptBusyId)}>
                  {receiptBusyId === receipt.id ? 'Preparing link…' : receiptLinks[receipt.id] ? 'Renew receipt link' : 'Get receipt link'}
                </Button>
                {receiptLinks[receipt.id] && <a className="button-link" href={receiptLinks[receipt.id]} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open receipt</a>}
              </div>
              {receiptLinks[receipt.id] && <p className="muted">This private link expires 60 seconds after it is created.</p>}
            </li>)}
          </ul>
        </div>

        {reservation.status === 'pending_review' && <div className="stack">
          <h3>Review payment</h3>
          {!decision ? <div className="row">
            <Button onClick={() => setDecision('approved')} disabled={busy || Boolean(emailBusyId)}>Approve receipt</Button>
            <Button variant="outline" onClick={() => setDecision('rejected')} disabled={busy || Boolean(emailBusyId)}>Reject receipt</Button>
          </div> : <MorphingModal viewId={decision} titleId="review-confirm-heading" busy={busy} onClose={() => { if (!busy) { setDecision(null); setReason('') } }}><form className="stack admin-review-form" onSubmit={review}><h2 id="review-confirm-heading">{decision === 'approved' ? 'Confirm this ticket?' : 'Request a new receipt?'}</h2>
            <p>{decision === 'approved'
              ? `Confirm payment of ${amount(reservation)} for ${reservation.full_name}? This confirms their ticket and sends an email.`
              : 'Explain what needs to change. The attendee will receive this reason by email and can upload another receipt.'}</p>
            {decision === 'rejected' && <label className="field" htmlFor="review-reason">Reason for rejection
              <textarea id="review-reason" value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} rows={3} disabled={busy} />
            </label>}
            <div className="row">
              <Button type="submit" disabled={busy || (decision === 'rejected' && !reason.trim())}>{busy ? 'Saving and sending…' : decision === 'approved' ? 'Approve and send email' : 'Reject and send email'}</Button>
              <Button type="button" variant="outline" onClick={() => { setDecision(null); setReason('') }} disabled={busy}>Cancel</Button>
            </div>
          </form></MorphingModal>}
        </div>}

        {whatsappUrl && <div className="stack">
          <h3>WhatsApp update</h3>
          <p className="muted">Open the prepared {reservation.status === 'approved' ? 'approval' : 'receipt replacement'} message, check it, then send it in WhatsApp.</p>
          <a className="button-link" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Open WhatsApp message</a>
        </div>}
        {['approved', 'rejected'].includes(reservation.status) && !whatsappUrl && <p className="muted">A WhatsApp link needs a valid Sri Lankan mobile number.</p>}

        <div className="stack">
          <h3>Email delivery</h3>
          {details.emails.length === 0 ? <p className="muted">An email is queued when a receipt is approved or rejected.</p> : <ul className="stack">
            {details.emails.map(email => {
              const reviewEntry = details.reviews.find(entry => entry.id === email.review_id)
              return <li key={email.id} className="stack">
                <p>{reviewEntry?.decision === 'approved' ? 'Approval' : reviewEntry?.decision === 'rejected' ? 'Receipt replacement' : 'Reservation update'} · {EMAIL_LABELS[email.status] || email.status} · {dateTime(email.sent_at || email.created_at)}</p>
                {email.review_id === details.reviews[0]?.id && reviewEntry?.decision === reservation.status && ['pending', 'failed'].includes(email.status) && email.attempts < 5 && <Button variant="outline" onClick={() => retryEmail(email)} disabled={Boolean(emailBusyId) || busy}>
                  {emailBusyId === email.id ? 'Sending…' : email.status === 'pending' ? 'Send email' : 'Retry email'}
                </Button>}
                {['sending', 'unknown'].includes(email.status) && <p className="muted">Delivery may already have happened. If this status stays unchanged, check the email provider's delivery logs before asking the site maintainer to reset it.</p>}
                {email.status === 'failed' && email.attempts >= 5 && <p className="muted">The retry limit has been reached. Ask the site maintainer to check email delivery.</p>}
              </li>
            })}
          </ul>}
        </div>

        {details.reviews.length > 0 && <div className="stack">
          <h3>Review history</h3>
          <ul className="stack">{details.reviews.map(entry => <li key={entry.id}>
            <p>{entry.decision === 'approved' ? 'Approved' : 'Rejected'} · {dateTime(entry.created_at)}</p>
            {entry.note && <p className="muted">{entry.note}</p>}
          </li>)}</ul>
        </div>}
      </>}
    </section>
  )
}

export default function AdminPage({ user }) {
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

  if (!supabase) return <ErrorPage status={503} description="The organizer workspace is not connected right now. Return to the event while the setup is completed." primaryAction={{ label: 'Back to the event', href: '/' }} secondaryAction={null} />
  if (!user) return <ErrorPage status={401} />
  if (access.userId !== user.id) return <p role="status">Checking admin access…</p>
  if (access.error) return <ErrorPage status={503} description={access.error} primaryAction={{ label: 'Try again', onClick: () => setRevision(current => current + 1) }} />
  if (!access.allowed) return <ErrorPage status={403} />
  return <AdminWorkspace key={user.id} Detail={ReservationDetails} initialTicket={scannedTicket()} />
}
