import { useRef, useState } from 'react'
import { Check, CheckCircle2, CircleDollarSign, Copy, LoaderCircle, Mail, Plus, Receipt, UserRound, X, ArrowLeft, ArrowRight } from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { normalizeFullName, normalizeNic, normalizePhone, normalizeSchoolIndex, normalizeJoinedYear, validateAttendee, formatMoney, validateReceipt } from '../../lib/tickets.js'
import ReservationField from '../ReservationField.jsx'
import ReservationProgress from '../ReservationProgress.jsx'
import ReviewDialog from '../ReviewDialog.jsx'
import ReceiptUpload from '../ReceiptUpload.jsx'

const validators = { fullName: normalizeFullName, phone: normalizePhone, nic: normalizeNic, schoolJoinedYear: normalizeJoinedYear, schoolIndex: normalizeSchoolIndex }
const phoneFormat = value => value.replace(/[\s()-]/g, '').replace(/^\+94(?:0)?/, '0').replace(/\D/g, '')
const yearOptions = Array.from({ length: 17 }, (_, index) => 2026 - index)

function initialValues() {
  return { fullName: '', email: '', phone: '', nic: '', schoolIndex: '', schoolJoinedYear: '', cashReceived: false, paymentCollector: '' }
}

function validEmail(value) {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address for the attendee.')
  return email
}

export default function AdminCashRegistration({ onCreated, schemaReady = true, admins = [], currentAdminId = '' }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'bank_transfer'
  const [receiptFile, setReceiptFile] = useState(null)
  const [preparingReceipt, setPreparingReceipt] = useState(false)
  const [bank, setBank] = useState(null)
  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [price, setPrice] = useState(7000)
  const [created, setCreated] = useState(null)
  const [review, setReview] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [setupStatus, setSetupStatus] = useState('idle')
  const [copied, setCopied] = useState(false)
  const form = useRef(null)

  const errors = Object.fromEntries(Object.entries(validators).map(([field, validate]) => {
    try { validate(values[field]); return [field, ''] } catch (validationError) { return [field, validationError.message] }
  }))
  const field = name => ({
    name,
    value: values[name],
    onChange: (key, value) => change(key, value),
    onBlur: key => setTouched(current => ({ ...current, [key]: true })),
    error: touched[name] ? errors[name] : '',
    disabled: pending,
  })

  async function start() {
    setOpen(true)
    setError('')
    setValues(current => ({ ...current, paymentCollector: current.paymentCollector || currentAdminId }))
    try {
      const [{ data: priceData, error: priceError }, { data: bankData }] = await Promise.all([
        supabase.from('event_settings').select('ticket_price_lkr').eq('id', 'greens-heaven-2026').single(),
        supabase.from('bank_details').select('*').eq('event_id', 'greens-heaven-2026').maybeSingle(),
      ])
      if (priceError) throw priceError
      setPrice(priceData.ticket_price_lkr)
      setBank(bankData)
    } catch {
      setError('Could not load the current ticket price. Refresh and try again.')
    }
  }

  function close() {
    if (pending) return
    setOpen(false)
    setStep(1)
    setPaymentMethod('cash')
    setReceiptFile(null)
    setValues(initialValues())
    setTouched({})
    setRequestId(crypto.randomUUID())
    setCreated(null)
    setReview(null)
    setSetupStatus('idle')
    setError('')
  }

  function change(name, value) {
    setValues(current => ({ ...current, [name]: name === 'nic' ? value.toUpperCase() : value }))
    setError('')
  }

  function continueToPayment(event) {
    event.preventDefault()
    const nextTouched = Object.fromEntries(Object.keys(validators).map(key => [key, true]))
    setTouched(nextTouched)
    const invalid = Object.keys(validators).find(key => errors[key])
    if (invalid) {
      form.current?.querySelector(`[name="${invalid}"]`)?.focus()
      return
    }
    setError('')
    setStep(2)
  }

  function showReview(event) {
    event.preventDefault()
    setError('')
    try {
      const attendee = validateAttendee(values.fullName, values.phone, values.nic, values.schoolIndex, values.schoolJoinedYear)
      const email = validEmail(values.email)
      if (paymentMethod === 'cash') {
        if (values.cashReceived && !values.paymentCollector) throw new Error('Choose which admin collected the physical cash.')
      } else {
        if (!receiptFile) throw new Error('Attach a payment receipt slip before reviewing.')
      }
      setReview({ ...attendee, email })
    } catch (validationError) {
      setError(validationError.message)
    }
  }

  async function sendSetup(reservation) {
    if (reservation.user_id) {
      setSetupStatus('linked')
      return
    }
    setSetupStatus('sending')
    try {
      const { data, error: sendError } = await supabase.functions.invoke('send-account-setup', {
        body: { reservation_id: reservation.id },
      })
      if (sendError || !['sent', 'already_linked'].includes(data?.status)) throw sendError || new Error('Setup email was not sent.')
      setSetupStatus(data.status === 'already_linked' ? 'linked' : 'sent')
    } catch {
      setSetupStatus('failed')
    }
  }

  async function saveRegistration() {
    if (!review || pending) return
    setPending(true)
    setError('')
    try {
      let savedData
      if (paymentMethod === 'cash') {
        const { data, error: saveError } = await supabase.rpc('create_admin_registration', {
          p_request_id: requestId,
          p_full_name: review.fullName,
          p_email: review.email,
          p_whatsapp: review.whatsapp,
          p_nic_number: review.nicNumber,
          p_school_index_number: review.schoolIndexNumber,
          p_school_joined_year: review.schoolJoinedYear,
          p_payment_method: 'cash',
          p_cash_received: values.cashReceived,
          p_payment_collector: values.cashReceived ? values.paymentCollector : null,
          p_receipt_path: null,
        })
        if (saveError || !data) throw saveError || new Error('Registration could not be saved.')
        savedData = data
      } else {
        // Upload receipt to storage bucket 'receipts'
        const ext = await validateReceipt(receiptFile)
        const path = `${currentAdminId || 'admin'}/${requestId}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(path, receiptFile, { contentType: receiptFile.type, upsert: false, cacheControl: '0' })
        if (uploadError) throw uploadError

        const { data, error: saveError } = await supabase.rpc('create_admin_registration', {
          p_request_id: requestId,
          p_full_name: review.fullName,
          p_email: review.email,
          p_whatsapp: review.whatsapp,
          p_nic_number: review.nicNumber,
          p_school_index_number: review.schoolIndexNumber,
          p_school_joined_year: review.schoolJoinedYear,
          p_payment_method: 'bank_transfer',
          p_cash_received: false,
          p_payment_collector: null,
          p_receipt_path: path,
        })
        if (saveError || !data) throw saveError || new Error('Registration could not be saved.')
        savedData = data
      }

      setCreated(savedData)
      setSetupStatus(savedData.user_id ? 'linked' : 'idle')
      onCreated?.()
    } catch (saveError) {
      const message = saveError?.message || ''
      if (['PGRST202', 'PGRST204', '42703'].includes(saveError?.code) || /schema cache|create_admin_registration.*does not exist/i.test(message)) {
        setError('Admin registration is not connected to the database yet. Apply the latest Supabase migrations, then refresh the admin panel.')
      } else if (saveError?.code === '23505' && /email/i.test(message)) {
        setError('This email already has a ticket. Ask the attendee to sign in to that account.')
      } else if (saveError?.code === '23505' && /nic/i.test(message)) {
        setError('This NIC is already linked to a ticket. Check the number or contact an organizer.')
      } else if (saveError?.code === '23505' && /school.index/i.test(message)) {
        setError('This school index is already linked to a ticket. Check the number or contact an organizer.')
      } else {
        setError(message || 'Registration could not be saved. Check the details and try again.')
      }
    } finally {
      setPending(false)
    }
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(created.reference)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch { setCopied(false) }
  }

  return <>
    <div className="admin-cash-registration-bar">
      <div><strong>In-person registration</strong><span>Record attendee details and cash or bank transfer receipt.</span></div>
      <button type="button" className="admin-button primary" onClick={start} disabled={!schemaReady} title={!schemaReady ? 'Apply the latest Supabase migration first' : undefined}><Plus size={16} />New registration</button>
    </div>
    {!schemaReady && <p className="admin-cash-schema-notice" role="status">Ticket records are shown in compatibility mode. Apply the latest Supabase migrations to enable in-person registration and payment tracking.</p>}
    {open && <div className="admin-cash-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <section className="admin-cash-dialog p-4" role="dialog" aria-modal="true" aria-labelledby="cash-registration-title" onKeyDown={event => { if (event.key === 'Escape' && !pending) close() }}>
        <header className="admin-cash-header">
          <div className="admin-cash-title-icon"><UserRound size={18} /></div>
          <div><p className="admin-eyebrow">IN-PERSON DESK</p><h2 id="cash-registration-title">{created ? 'Registration saved' : 'New attendee'}</h2></div>
          <button type="button" className="admin-dialog-icon-btn" onClick={close} disabled={pending} aria-label="Close registration"><X size={17} /></button>
        </header>
        {created ? <div className="admin-cash-success" role="status">
          <span className="admin-cash-success-icon"><CheckCircle2 size={24} /></span>
          <h3>{created.full_name}</h3>
          <button type="button" className="admin-cash-reference" onClick={copyReference} title="Copy ticket ID">
            <span>{created.reference}</span>{copied ? <Check size={15} /> : <Copy size={14} />}
          </button>
          <p className="admin-cash-paid">
            {created.payment_method === 'cash' ? (
              <>
                <CircleDollarSign size={16} />
                {created.status === 'awaiting_payment'
                  ? `${formatMoney(created.amount_lkr)} · physical cash due`
                  : created.status === 'pending_review'
                    ? `${formatMoney(created.amount_lkr)} · physical cash recorded`
                    : `${formatMoney(created.amount_lkr)} · physical cash received · ticket confirmed`}
              </>
            ) : (
              <>
                <Receipt size={16} />
                {`${formatMoney(created.amount_lkr)} · Bank transfer · Receipt sent for review`}
              </>
            )}
          </p>
          <div className={`admin-cash-account-state ${setupStatus}`}>
            {setupStatus === 'sending' ? <><LoaderCircle size={15} className="admin-cash-spinner" />Sending account setup email…</>
              : setupStatus === 'sent' ? <><Mail size={15} />Setup link sent to {created.email}</>
                : setupStatus === 'linked' ? <><CheckCircle2 size={15} />Linked to an existing account</>
            : setupStatus === 'failed' ? <><Mail size={15} />Ticket saved. Setup email could not be sent.</>
                    : <><CheckCircle2 size={15} />Ticket saved · account setup is optional</>}
          </div>
          {setupStatus === 'idle' && !created.user_id && <>
            <p className="admin-cash-help">The ticket QR will be emailed after approval. No account is needed at the entrance.</p>
            <button type="button" className="admin-button primary admin-cash-retry" onClick={() => sendSetup(created)}><Mail size={15} />Send optional password setup link</button>
          </>}
          {setupStatus === 'failed' && <button type="button" className="admin-button primary admin-cash-retry" onClick={() => sendSetup(created)}><Mail size={15} />Try setup email again</button>}
          {setupStatus === 'linked' && <p className="admin-cash-help">They can use their existing account if they want. The emailed ticket QR works without signing in.</p>}
          {setupStatus === 'sent' && <p className="admin-cash-help">They can set a password from the email link. The ticket QR will arrive after approval.</p>}
          <button type="button" className="admin-button admin-cash-done" onClick={close}>Done</button>
        </div> : <>
          <ReservationProgress step={review ? 3 : step} completed={review ? 2 : step - 1} />
          {step === 1 ? <form ref={form} className="admin-cash-form admin-cash-details-form" onSubmit={continueToPayment} noValidate>
            <div className="admin-cash-step-heading"><h3>Who’s joining us?</h3><p>Use the details shown on their NIC and school records.</p></div>
            <fieldset disabled={pending}>
              <ReservationField {...field('fullName')} label="Full name" required autoComplete="name" placeholder="Name as it appears on your NIC" maxLength={100} enterKeyHint="next" />
              <ReservationField {...field('phone')} label="WhatsApp number" digits={10} format={phoneFormat} hint="10 local digits, starting 07. You can paste a +94 number too." required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="077 123 4567" maxLength={16} enterKeyHint="next" />
              <ReservationField {...field('nic')} label="NIC number" digits={12} hint="Enter the 12 digits on your new Sri Lankan NIC." required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="200712345678" maxLength={14} enterKeyHint="next" />
              <div className="reserve-school-fields">
                <ReservationField {...field('schoolJoinedYear')} label="Year joined school" required><option value="">Choose year</option>{yearOptions.map(year => <option value={year} key={year}>{year}</option>)}</ReservationField>
                <ReservationField {...field('schoolIndex')} label="School index" digits={5} hint="Your 5-digit index, if you have it." inputMode="numeric" autoComplete="off" placeholder="24929" maxLength={5} enterKeyHint="done" />
              </div>
            </fieldset>
            {error && <p className="admin-error" role="alert">{error}</p>}
            <footer className="admin-cash-actions mb-12"><button type="button" className="admin-button" onClick={close}>Cancel</button><button type="submit" className="admin-button primary">Continue to payment<ArrowRight size={16} /></button></footer>
          </form> : <form className="admin-cash-form admin-cash-payment-form" onSubmit={showReview} noValidate>
            <div className="admin-cash-step-heading"><h3>Payment and account</h3><p>Choose payment method and enter attendee email address.</p></div>
            <label className="reserve-field admin-cash-email-field"><span>Email address</span><input type="email" inputMode="email" autoComplete="email" value={values.email} onChange={event => change('email', event.target.value)} maxLength={254} placeholder="attendee@example.com" required /></label>

            <div className="admin-payment-mode-tabs" role="tablist" aria-label="Payment method">
              <button
                type="button"
                role="tab"
                aria-selected={paymentMethod === 'cash'}
                className={`admin-payment-mode-tab ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => { setPaymentMethod('cash'); setError('') }}
                disabled={pending}
              >
                <CircleDollarSign size={16} />
                <span>Physical cash</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paymentMethod === 'bank_transfer'}
                className={`admin-payment-mode-tab ${paymentMethod === 'bank_transfer' ? 'active' : ''}`}
                onClick={() => { setPaymentMethod('bank_transfer'); setError('') }}
                disabled={pending}
              >
                <Receipt size={16} />
                <span>Bank transfer receipt</span>
              </button>
            </div>

            {paymentMethod === 'cash' ? <>
              <div className="admin-cash-amount"><span><CircleDollarSign size={17} />Physical cash</span><strong>{formatMoney(price)}</strong></div>
              <label className="admin-cash-confirm"><input type="checkbox" checked={values.cashReceived} onChange={event => setValues(current => ({ ...current, cashReceived: event.target.checked, paymentCollector: event.target.checked ? current.paymentCollector || currentAdminId : '' }))} /><span><strong>Cash already collected</strong><small>Leave unchecked to save this as payment due. If it has been collected, select the admin who received it.</small></span></label>
              {values.cashReceived && <label className="reserve-field admin-cash-collector-field"><span>Cash collected by</span><select value={values.paymentCollector} onChange={event => change('paymentCollector', event.target.value)} required><option value="">Choose admin</option>{currentAdminId && !admins.some(admin => (admin.user_id || admin.id) === currentAdminId) && <option value={currentAdminId}>You</option>}{admins.map(admin => { const id = admin.user_id || admin.id; return id ? <option value={id} key={id}>{id === currentAdminId ? `${admin.full_name || admin.email || 'Admin'} (you)` : admin.full_name || admin.email || 'Admin'}</option> : null })}</select></label>}
            </> : <>
              <div className="admin-cash-amount"><span><Receipt size={17} />Bank transfer (Online)</span><strong>{formatMoney(price)}</strong></div>
              {bank && <div className="admin-bank-info-box">
                <span className="admin-bank-info-title">Event Bank Account</span>
                <div className="admin-bank-info-grid">
                  <div><span className="muted">Bank:</span> <strong>{bank.bank_name} {bank.branch && `(${bank.branch})`}</strong></div>
                  <div><span className="muted">Account:</span> <strong>{bank.account_number}</strong></div>
                  <div><span className="muted">Name:</span> <strong>{bank.account_name}</strong></div>
                </div>
              </div>}
              <ReceiptUpload
                file={receiptFile}
                onFileChange={file => { setReceiptFile(file); setError('') }}
                disabled={pending}
                error=""
                onError={setError}
                onPreparingChange={setPreparingReceipt}
                idPrefix="admin-receipt"
              />
            </>}

            {error && <p className="admin-error" role="alert">{error}</p>}
            <footer className="admin-cash-actions mb-12"><button type="button" className="admin-button" onClick={() => { setError(''); setStep(1) }} disabled={pending || preparingReceipt}><ArrowLeft size={15} />Back</button><button type="submit" className="admin-button primary" disabled={pending || preparingReceipt}>Review registration<ArrowRight size={16} /></button></footer>
          </form>}
        </>}
        <ReviewDialog open={Boolean(review)} title="Check this registration." description="Confirm the attendee details and payment record." confirmLabel="Save registration" onClose={() => setReview(null)} onConfirm={saveRegistration}
          fields={review ? [
            ['Full name', review.fullName],
            ['Mobile', review.whatsapp],
            ['NIC', review.nicNumber],
            ['School index', review.schoolIndexNumber],
            ['Joined school', review.schoolJoinedYear],
            ['Email', review.email],
            ['Payment', paymentMethod === 'cash'
              ? values.cashReceived ? `Physical cash received · ${formatMoney(price)}` : `Physical cash due · ${formatMoney(price)}`
              : `Bank transfer (Online) · ${formatMoney(price)}`],
            ...(paymentMethod === 'cash' && values.cashReceived ? [['Cash collected by', admins.find(admin => (admin.user_id || admin.id) === values.paymentCollector)?.full_name || admins.find(admin => (admin.user_id || admin.id) === values.paymentCollector)?.email || 'Selected admin']] : []),
            ...(paymentMethod === 'bank_transfer' ? [['Receipt file', receiptFile?.name || 'Attached']] : []),
          ] : []} />
      </section>
    </div>}
  </>
}
