import ReviewDialog from '../components/ReviewDialog.jsx'
import { Loader } from '../components/motion/loader.jsx'
import ReceiptPdfPreview from '../components/ReceiptPdfPreview.jsx'
import { useToast } from '../lib/toasts.js'
import { Copy, Check, Upload, FileText, Image as ImageIcon, ArrowRight, ShieldCheck, Trash2 } from 'lucide-react'
import { prepareReceipt } from '../lib/prepareReceipt.js'
import ReservationProgress from '../components/ReservationProgress.jsx'
import { navigateReservation } from '../lib/reservationNavigation.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../components/ui/button.jsx'
import { Loading, Notice, SetupNotice } from '../components/Feedback.jsx'
import { supabase } from '../utils/supabase.js'
import { EVENT_ID, formatMoney, friendlyError, validateReceipt } from '../lib/tickets.js'
import ReservationDetails from '../components/ReservationDetails.jsx'
import AttendeeDashboard from '../components/AttendeeDashboard.jsx'

function CopyValue({ label, value }) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); toast.show({ id: 'copy-confirmation', status: 'success', title: `${label} copied` }) }
    catch { setMessage('Select the value to copy'); toast.show({ status: 'error', title: 'Could not copy. Select the value to copy it manually.' }) }
  }
  return <div className="payment-copy-row"><div><dt>{label}</dt><dd>{value}</dd></div><button type="button" className="payment-icon-button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>{message === 'Copied' ? <Check size={18} /> : <Copy size={18} />}</button><span className="payment-copy-feedback" role="status">{message}</span></div>
}

function BankDetails({ bank, reservation }) {
  if (!bank) return <Notice>Bank details are not available yet. Please check back before paying.</Notice>
  return <section className="panel stack payment-bank" aria-labelledby="bank-title">
    <div className="payment-card-heading"><span className="payment-number">01</span><div><p className="reserve-eyebrow">BANK TRANSFER</p><h2 id="bank-title">Bank transfer.</h2></div></div>
    {bank.is_demo && <Notice kind="warning"><strong>Demo details. Do not transfer money.</strong> These details are for testing and will be replaced before payments open.</Notice>}
    <div className="payment-amount"><span>Transfer amount</span><strong>{formatMoney(reservation.amount_lkr)}</strong></div>
    <dl className="payment-bank-list">
      <div><dt>Bank & branch</dt><dd>{bank.bank_name}<small>{bank.branch || '—'}</small></dd></div>
      <div><dt>Account holder</dt><dd>{bank.account_name}</dd></div>
      <CopyValue label="Account number" value={bank.account_number} />
      <CopyValue label="Transfer reference" value={reservation.reference} />
    </dl>
    <p className="payment-help">Use <strong>{reservation.reference}</strong> as the transfer reference.</p>
    {bank.payment_instructions && <details className="payment-extra"><summary>More payment details</summary><p className="payment-help">{bank.payment_instructions}</p></details>}
  </section>
}

function ReceiptForm({ reservation, user, bank, onSaved, onRefresh }) {
  const toast = useToast()
  const [confirmUpload, setConfirmUpload] = useState(false)
  const [file, setFile] = useState(null)
  const [uploaded, setUploaded] = useState(null)
  const [pending, setPending] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [stage, setStage] = useState('')
  const [originalSize, setOriginalSize] = useState(0)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const selection = useRef(0)
  const input = useRef(null)
  const previewRef = useRef('')
  function clearPreview() {
    URL.revokeObjectURL(previewRef.current)
    previewRef.current = ''
    setPreview('')
  }
  useEffect(() => () => { selection.current++; URL.revokeObjectURL(previewRef.current) }, [])
  async function choose(selected) {
    const request = ++selection.current
    setFile(null); clearPreview(); setError(''); setPreparing(true)
    try {
      const result = await prepareReceipt(selected)
      if (request === selection.current) { setFile(result.file); setOriginalSize(result.originalSize); if (result.file.type !== 'application/pdf') { previewRef.current = URL.createObjectURL(result.file); setPreview(previewRef.current) } }
    } catch (err) { if (request === selection.current) setError(err.message) }
    finally { if (request === selection.current) setPreparing(false) }
  }
  const fileSize = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
  const inFlight = useRef(false)

  async function submit() {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setError(''); setStage('Uploading your receipt…')
    let path = uploaded
    toast.show({ id: 'receipt-upload', status: 'loading', title: uploaded ? 'Sending for review…' : 'Uploading receipt…', dismissible: false })
    try {
      if (!path) {
        const ext = await validateReceipt(file)
        path = `${user.id}/${reservation.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '0' })
        if (error) throw error
        setUploaded(path)
      }
      // Keep an uploaded path when the final RPC fails, so a retry doesn't upload twice.
      setStage('Sending for review…')
      toast.update('receipt-upload', { title: 'Sending for review…' })
      const { error } = await supabase.rpc('submit_receipt', { p_reservation_id: reservation.id, p_receipt_path: path })
      if (error) throw error
      toast.update('receipt-upload', { status: 'success', title: 'Receipt sent for review', duration: 3600, dismissible: true })
      await onSaved()
    } catch (err) {
      toast.dismiss('receipt-upload')
      const validation = /receipt|file type|JPG|PNG|PDF|5 MB|Choose a receipt/.test(err.message) && !err.code
      setError(validation ? err.message : friendlyError(err))
      // A lost response can hide a successful submission. Reconcile with the
      // saved reservation before asking the attendee to retry this same file.
      if (path) await onRefresh()
    } finally { inFlight.current = false; setPending(false) }
  }

  return <section className="panel stack payment-upload" aria-labelledby="upload-title">
    <div className="payment-card-heading"><span className="payment-number">02</span><div><p className="reserve-eyebrow">PROOF OF PAYMENT</p><h2 id="upload-title">{reservation.status === 'rejected' ? 'Replace your receipt.' : 'Add your receipt.'}</h2></div></div>
    <p className="payment-help">Upload a clear receipt showing the amount, date and receiving account.</p>
    {bank?.is_demo && <Notice kind="warning">Testing mode: use a sample receipt without real bank or personal details.</Notice>}
    <Notice kind="error">{error}</Notice>
    <ReviewDialog open={confirmUpload} title="Send this receipt?" description="The organizers will check it before confirming your ticket." fields={[['Receipt', file?.name], ['Reference', reservation.reference], ['Amount', formatMoney(reservation.amount_lkr)]]} confirmLabel="Submit receipt" onClose={() => setConfirmUpload(false)} onConfirm={submit} />
    <form className="stack" onSubmit={e => { e.preventDefault(); if (!pending && !preparing && bank && (file || uploaded)) setConfirmUpload(true) }} aria-busy={pending || preparing}>
      <label className="receipt-picker">
        <Upload size={24} aria-hidden="true" /><strong>{file ? 'Choose a different receipt' : 'Choose your receipt'}</strong><span>Tap to browse · JPG, PNG or PDF</span>
        <input ref={input} type="file" aria-label="Payment receipt" accept="image/jpeg,image/png,application/pdf" disabled={pending || preparing || !bank || Boolean(uploaded)} onChange={e => { if (e.target.files?.[0]) void choose(e.target.files[0]) }} aria-describedby="receipt-help" />
      </label>
      <p id="receipt-help" className="payment-help">PDF up to 5 MB · JPG/PNG up to 20 MB. Large photos are reduced automatically.</p>
      {preparing && <p className="payment-help"><Loader size={18} label="Preparing receipt" /> Preparing your receipt…</p>}
      {file && <div className="receipt-preview">
        {file.type !== 'application/pdf' && preview ? <a href={preview} target="_blank" rel="noreferrer" aria-label="Open receipt image preview"><img src={preview} alt="Your selected receipt. Check that the payment details are readable." /></a> : <ReceiptPdfPreview file={file} />}
        <div className="receipt-file-info">{file.type === 'application/pdf' ? <FileText size={18} /> : <ImageIcon size={18} />}<div><strong title={file.name}>{file.name}</strong><span>{fileSize(file.size)}{file.size < originalSize && ` · Reduced from ${fileSize(originalSize)}`}</span></div>
        <button type="button" className="receipt-remove" aria-label="Remove receipt" title="Remove receipt" disabled={pending || Boolean(uploaded)} onClick={() => { selection.current++; setFile(null); clearPreview(); setError(''); if (input.current) { input.current.value = ''; input.current.focus() } }}><Trash2 size={18} aria-hidden="true" /></button></div>
      </div>}
      {uploaded && !pending && <p role="status" className="payment-help">Your file is uploaded. Retry to finish submitting it for review.</p>}
      <p className="payment-private"><ShieldCheck size={16} />Your receipt stays private.</p>
      <button className="reserve-submit" type="submit" disabled={pending || preparing || !bank || (!file && !uploaded)}>{pending ? stage : uploaded ? 'Retry submission' : 'Send receipt for review'}{pending ? <Loader size={18} label={stage} /> : <ArrowRight size={18} />}</button>
      {pending && <span role="status" className="sr-only">{stage}</span>}
      <p className="payment-help">We’ll email you after organizer approval.</p>
    </form>
  </section>
}

export default function ReservationPage({ user, view = 'reserve' }) {
  const toast = useToast()
  const dashboard = view === 'dashboard'
  const payment = view === 'payment'
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const alive = useRef(false)
  const revision = useRef(0)
  const inFlight = useRef(false)

  const refresh = useCallback(() => {
    if (!supabase || !user) return Promise.resolve()
    const request = ++revision.current
    return supabase.rpc('claim_in_person_reservation').then(({ error: claimError }) => {
      if (claimError) throw claimError
      return Promise.all([
        supabase.from('reservations').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bank_details').select('*').eq('event_id', EVENT_ID).maybeSingle(),
        supabase.from('event_settings').select('*').eq('id', EVENT_ID).single(),
      ])
    }).then(results => {
      const failure = results.find(r => r.error)
      if (failure) throw failure.error
      if (alive.current && request === revision.current) {
        setError('')
        setData({ reservation: results[0].data, bank: results[1].data, event: results[2].data })
      }
    }).catch(err => { if (alive.current && request === revision.current) setError(friendlyError(err)) })
      .finally(() => { if (alive.current && request === revision.current) setLoading(false) })
  }, [user])

  useEffect(() => {
    alive.current = true
    void refresh()
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { alive.current = false; clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const reservation = data?.reservation
  const needsPayment = reservation?.status === 'awaiting_payment' || reservation?.status === 'rejected'
  const redirect = reservation && view === 'reserve'
    ? needsPayment ? '/payment' : '/dashboard'
    : reservation && payment && !needsPayment ? '/dashboard' : null

  useEffect(() => {
    if (!redirect) return
    const timer = window.setTimeout(() => navigateReservation(redirect, { replace: true }), 0)
    return () => window.clearTimeout(timer)
  }, [redirect])

  async function reserve(attendee) {
    if (inFlight.current) return
    inFlight.current = true; setPending(true); setError('')
    try {
      const { error } = await supabase.rpc('reserve_ticket', {
        p_full_name: attendee.fullName,
        p_whatsapp: attendee.whatsapp,
        p_nic_number: attendee.nicNumber,
        p_school_index_number: attendee.schoolIndexNumber,
        p_school_joined_year: attendee.schoolJoinedYear,
      })
      if (error) throw error
      await refresh(); inFlight.current = false; setPending(false); toast.show({ status: 'success', title: 'Your reservation is saved' }); navigateReservation('/payment')
    } catch (err) {
      setError(/^Enter /.test(err.message) ? err.message : friendlyError(err))
      inFlight.current = false; setPending(false)
    }
  }

  if (!supabase) return <SetupNotice />
  if (!user && dashboard) return <AttendeeDashboard />
  if (!user && !payment && !dashboard) return <ReservationDetails />
  if (!user) return <section className="panel stack narrow"><h1 className="page-heading">{payment ? 'Sign in to continue payment' : 'Reserve your ticket'}</h1><p>Sign in to save your details, view payment instructions, and follow your reservation.</p><a href="/login" className="button-link">{payment ? 'Sign in' : 'Sign in to reserve'}</a><p className="muted text-sm">One ticket per account · Rs. 6,500</p></section>
  if (loading) return <Loading />
  if (redirect) return <Loading>{redirect === '/payment' ? 'Opening your payment page…' : 'Opening your dashboard…'}</Loading>
  if (!data) return <div className="stack"><Notice kind="error">{error}</Notice><Button onClick={refresh}>Try again</Button></div>

  const { bank, event } = data
  if (dashboard) return <AttendeeDashboard user={user} reservation={reservation} event={event} error={error} onRefresh={refresh} />
  if (!reservation && !dashboard && !payment) return <ReservationDetails user={user} bank={bank} event={event} pending={pending} error={error} onReserve={reserve} />
  if ((dashboard || payment) && !reservation) return <div className="stack"><div><p className="eyebrow">Greens Heaven · 31 October 2026</p><h1 className="page-heading">{payment ? 'Reserve a ticket before paying' : 'Your dashboard'}</h1></div><section className="panel stack narrow"><h2>Your ticket journey starts here</h2><p>Reserve your ticket first. You’ll go straight to the payment page for bank details and receipt upload, then follow organizer updates from your dashboard.</p><p className="muted">One ticket · {formatMoney(event.ticket_price_lkr)}</p><a className="button-link self-start" href="/reserve">Reserve your ticket</a></section></div>
  if (payment) return <div className="stack payment-experience">
    <ReservationProgress step={2} completed={1} />
    <div className="reserve-heading"><p className="reserve-eyebrow">YOUR PLACE IS RESERVED</p><h1 className="page-heading">{reservation.status === 'rejected' ? 'Update your receipt' : 'Complete your payment'}</h1></div>
    <Notice kind="error">{error}</Notice>
    <section className="payment-summary">
      <div className="row page-title"><h2>One ticket · {formatMoney(reservation.amount_lkr)}</h2><span className={`badge status-${reservation.status}`}>{reservation.reference}</span></div>
      <p>{reservation.status === 'rejected' ? 'Read the organizer’s note before uploading a corrected receipt or making another transfer.' : 'Transfer the amount, then upload your receipt.'}</p>
      <p className="muted text-sm">No refunds for personal cancellations. <a href="/refund-policy" target="_blank" rel="noreferrer">Read the refund policy</a>.</p>
      {reservation.review_note && <Notice kind="warning"><strong>Organizer’s note</strong><p>{reservation.review_note}</p></Notice>}
    </section>
    <div className="payment-grid"><BankDetails bank={bank} reservation={reservation} /><ReceiptForm key={`${reservation.id}-${reservation.updated_at}`} reservation={reservation} user={user} bank={bank} onRefresh={refresh} onSaved={async () => { await refresh(); navigateReservation('/dashboard') }} /></div>
    <p className="muted text-sm">Not ready yet? <a href="/dashboard">Save payment for later</a>.</p>
  </div>
  return null
}
