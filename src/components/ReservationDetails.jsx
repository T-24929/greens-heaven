import ReviewDialog from './ReviewDialog.jsx'
import ReservationField from './ReservationField.jsx'
import ReservationProgress from './ReservationProgress.jsx'
import { useRef, useState } from 'react'
import { ArrowRight, Check, LoaderCircle, LockKeyhole } from 'lucide-react'
import TearTicket from './TearTicket.jsx'
import { Notice } from './Feedback.jsx'
import { EVENT, formatMoney, normalizeFullName, normalizePhone, normalizeNic, normalizeSchoolIndex, normalizeJoinedYear, validateAttendee } from '../lib/tickets.js'

const validators = { fullName: normalizeFullName, phone: normalizePhone, nic: normalizeNic, schoolIndex: normalizeSchoolIndex, schoolJoinedYear: normalizeJoinedYear }
const initial = { fullName: '', phone: '', nic: '', schoolIndex: '', schoolJoinedYear: '' }

export default function ReservationDetails({ user, event = EVENT, bank, pending = false, error, onReserve }) {
  const [values, setValues] = useState(initial)
  const [touched, setTouched] = useState({})
  const form = useRef(null)
  const [review, setReview] = useState(null)
  const amount = event.ticket_price_lkr
  const errors = Object.fromEntries(Object.entries(validators).map(([field, validate]) => {
    try { validate(values[field]); return [field, ''] } catch (err) { return [field, err.message] }
  }))
  const change = (name, value) => setValues(previous => ({ ...previous, [name]: name === 'nic' ? value.toUpperCase() : value }))
  const blur = name => setTouched(previous => ({ ...previous, [name]: true }))
  const field = name => ({ name, value: values[name], onChange: change, onBlur: blur, error: touched[name] ? errors[name] : '', disabled: pending })
  function submit(e) {
    e.preventDefault()
    if (pending || !event.reservations_open) return
    setTouched(Object.fromEntries(Object.keys(validators).map(key => [key, true])))
    const invalid = Object.keys(validators).find(key => errors[key])
    if (invalid) { form.current.elements.namedItem(invalid)?.focus(); return }
    setReview(validateAttendee(values.fullName, values.phone, values.nic, values.schoolIndex, values.schoolJoinedYear))
  }
  return <div className="reserve-experience">
    <ReviewDialog open={Boolean(review)} title="Check your details." description="Make sure these match your records before reserving." confirmLabel="Reserve ticket" onClose={() => setReview(null)} onConfirm={() => onReserve(review)}
      fields={review ? [['Full name', review.fullName], ['Mobile', review.whatsapp], ['NIC', review.nicNumber], ['School index', review.schoolIndexNumber], ['Joined school', review.schoolJoinedYear], ['Ticket', formatMoney(amount)]] : []} />
    <ReservationProgress step={1} completed={0} />
    <div className="reserve-heading"><p className="reserve-eyebrow">A PLACE WITH YOUR BATCH</p><h1>Make it your evening.</h1><p>One ticket. {formatMoney(amount)}. Add your details, then continue to payment.</p></div>
    <div className="reserve-grid">
      <section className="reserve-form-panel" aria-labelledby="reserve-form-title">
        {!user ? <div className="reserve-guest"><span className="reserve-lock"><LockKeyhole size={24} /></span><h2 id="reserve-form-title">Your ticket starts here.</h2><p>Sign in or create an account to save your details and follow your reservation.</p><a href="/login" className="reserve-submit">Sign in to reserve<ArrowRight size={18} /></a><p className="reserve-small">One ticket per account. Payment comes after your details.</p></div> : <>
          <div className="reserve-form-heading"><h2 id="reserve-form-title">Who’s joining us?</h2><p>Use the details shown on your NIC and school records.</p></div>
          <div className="reserve-account"><Check size={16} aria-hidden="true" /><span>Signed in as <strong>{user.email}</strong></span></div>
          <Notice kind="error">{error}</Notice>
          {bank?.is_demo && <Notice kind="warning">Testing mode. Demo bank details are still active; do not make a real transfer.</Notice>}
          {!event.reservations_open && <Notice>Reservations are currently closed.</Notice>}
          <form ref={form} noValidate onSubmit={submit} className="reserve-form" aria-busy={pending}>
            <fieldset disabled={pending}>
              <legend>Attendee details</legend>
              <ReservationField {...field('fullName')} label="Full name" required autoComplete="name" placeholder="Name as it appears on your NIC" maxLength={100} enterKeyHint="next" />
              <ReservationField {...field('phone')} label="WhatsApp number" digits={10} format={value => value.replace(/[\s()-]/g, '').replace(/^\+94(?:0)?/, '0').replace(/\D/g, '')} hint="10 local digits, starting 07. You can paste a +94 number too." required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="077 123 4567" maxLength={16} enterKeyHint="next" />
              <ReservationField {...field('nic')} label="NIC number" digits={12} hint="Enter the 12 digits on your new Sri Lankan NIC." required autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="200712345678" maxLength={14} enterKeyHint="next" />
              <div className="reserve-school-fields"><ReservationField {...field('schoolJoinedYear')} label="Year joined school" required><option value="">Choose year</option>{Array.from({ length: 17 }, (_, i) => 2026 - i).map(year => <option value={year} key={year}>{year}</option>)}</ReservationField><ReservationField {...field('schoolIndex')} label="School index" digits={5} hint="Your 5-digit index, if you have it." inputMode="numeric" autoComplete="off" placeholder="24929" maxLength={5} enterKeyHint="done" /></div>
            </fieldset>
            <p className="reserve-privacy"><LockKeyhole size={14} aria-hidden="true" /><span>Only the organizers use your identity details to verify your reservation. <a href="/privacy">Privacy information</a></span></p>
            <div className="reserve-form-total"><span>1 ticket <small>One person</small></span><strong>{formatMoney(amount)}</strong></div>
            <button type="submit" className="reserve-submit" disabled={pending || !event.reservations_open}>{pending ? 'Saving your details…' : 'Continue to payment'}{pending ? <LoaderCircle size={18} className="reserve-spinner" /> : <ArrowRight size={18} />}</button>
            <p className="reserve-next">Next: bank transfer details and receipt upload. Confirmation follows organizer approval.</p>
          </form>
        </>}
      </section>
      <aside className="reserve-summary" aria-label="Your evening">
        <p className="reserve-eyebrow">YOUR EVENING, AT A GLANCE</p>
        <TearTicket amount={amount} />
        <dl className="reserve-facts"><div><dt>When</dt><dd>31 October 2026 <span>5:30 pm onwards</span></dd></div><div><dt>Where</dt><dd>Solis Hotel</dd></div><div><dt>The batch</dt><dd>Isipathana College <span>2023 O/L & 2026 A/L</span></dd></div></dl>
        <div className="reserve-next-card"><span>UP NEXT</span><h3>Reserve. Transfer. Reunite.</h3><p>Your GH reference is assigned when you reserve. Use it for your transfer, upload the receipt, then track approval in your dashboard.</p></div>
        <p className="reserve-policy">Please read the <a href="/refund-policy">refund policy</a> before paying.</p>
      </aside>
    </div>
  </div>
}
