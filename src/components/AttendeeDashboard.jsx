import { useToast } from '../lib/toasts.js'
import ReservationProgress from './ReservationProgress.jsx'
import { useState } from 'react'
import { ArrowUpRight, ArrowRight, Check, Clock3, Copy, RefreshCw, CalendarDays, MapPin, ShieldCheck, Ticket, AlertCircle, LockKeyhole } from 'lucide-react'
import FadeContent from './FadeContent.jsx'
import BorderGlow from './BorderGlow.jsx'
import TicketFlipCard from './TicketFlipCard.jsx'
import { Notice } from './Feedback.jsx'
import { formatMoney } from '../lib/tickets.js'
import '../pages/Dashboard.css'

const states = {
  awaiting_payment: { label: 'Awaiting payment receipt', title: 'Your place is reserved.', description: 'Make your bank transfer, then upload the receipt. The organizers will confirm your ticket after checking it.', action: 'Continue to payment', icon: Clock3 },
  pending_review: { label: 'Under review', title: 'Over to the organizers.', description: 'Your receipt has been submitted. You don’t need to pay again. Your status will update here after the organizers review it.', icon: Clock3 },
  approved: { label: 'Ticket confirmed', title: 'See you at Solis.', description: 'Your payment is approved. Turn your ticket over to show the QR, or save the code to your phone. Keep your reference handy for the organizers.', icon: ShieldCheck },
  rejected: { label: 'Receipt needs attention', title: 'One thing to sort out.', description: 'Read the organizer’s note and upload a corrected receipt. Check with the organizers before making another payment.', action: 'Update receipt', icon: AlertCircle },
}

export default function AttendeeDashboard({ user, reservation, event, error, onRefresh }) {
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const state = states[reservation?.status]
  const StatusIcon = state?.icon || Ticket
  const name = reservation?.full_name?.trim()
  const confirmed = reservation?.status === 'approved'
  const ticketMessage = reservation?.status === 'pending_review' ? 'Receipt received · Awaiting approval' : reservation?.status === 'rejected' ? 'Receipt needs attention · Not confirmed' : 'Awaiting payment receipt'
  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }
  async function copyReference() {
    try { await navigator.clipboard.writeText(reservation.reference); setCopyMessage('Reference copied.'); toast.show({ id: 'copy-confirmation', status: 'success', title: 'Reference copied' }) }
    catch { setCopyMessage('Could not copy. Select the reference above to copy it manually.') }
  }
  return <div className="dashboard-page">
    {reservation && <ReservationProgress completed={reservation.status === 'approved' ? 3 : ['pending_review'].includes(reservation.status) ? 2 : 1} step={['awaiting_payment', 'rejected'].includes(reservation.status) ? 2 : 3} />}
    <FadeContent trigger="mount" duration={.5} className="dashboard-heading">
      <div><p className="dash-eyebrow">YOUR EVENING · XXVI</p><h1>{name ? <>Welcome back, <em>{name}.</em></> : 'Your place in the evening.'}</h1><p>One evening. The whole batch. Everything for your ticket, right here.</p></div>
      {!reservation && user && onRefresh && <button className="dash-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh ticket status"><RefreshCw size={16} className={refreshing ? 'dash-spin' : ''} />{refreshing ? 'Checking…' : 'Refresh status'}</button>}
    </FadeContent>
    <Notice kind="error">{error}</Notice>
    {!reservation ? <FadeContent duration={.55} trigger="mount" className="dash-empty"><img className="dash-empty-art" src="/images/hero-grass.png" alt="Greens Heaven event artwork" width="1080" height="1350" /><div className="dash-empty-content"><span className="dash-empty-icon"><Ticket size={24} /></span><p className="dash-eyebrow">THE NEXT STEP IS YOURS</p><h2>A ticket. A whole<br /><em>lot to catch up on.</em></h2><p>{user ? 'Save your details, make your transfer and leave the receipt with us. You can follow every step here.' : 'Sign in to reserve your place and keep your payment updates together.'}</p><div className="dash-empty-action"><a className="dash-primary" href={user ? '/reserve' : '/login'}>{user ? 'Reserve my ticket' : 'Sign in to continue'}<ArrowRight size={18} /></a><span className="dash-caption">One person · {formatMoney(event?.ticket_price_lkr || 6500)}</span></div></div></FadeContent> : <div className="dashboard-grid">
      <FadeContent trigger="mount" duration={.65} className="dash-ticket-column">
        <TicketFlipCard key={`${reservation.id}-${reservation.status}`} reservation={reservation} actions={<><button title="Refresh ticket status" className="dash-refresh dash-refresh-icon" onClick={refresh} disabled={refreshing} aria-label="Refresh ticket status"><RefreshCw size={16} className={refreshing ? 'dash-spin' : ''} /></button>
          <a className="dash-calendar" href="/greens-heaven.ics" download><CalendarDays size={16} />Save the date</a>
        </>}>
        <article className={`dash-ticket ${reservation.status === 'approved' ? 'dash-ticket-confirmed' : 'dash-ticket-unconfirmed'}`} aria-label={confirmed ? 'Your confirmed ticket' : 'Your reservation — not an entry ticket'}>
          {!confirmed && <div className="dash-ticket-unconfirmed-label"><LockKeyhole size={16} /><span>{ticketMessage}</span></div>}
          <div className="dash-ticket-frost" aria-hidden="true"><i /><i /></div><img className="dash-ticket-photo" src="/images/hero-grass.png" alt="" width="1080" height="1350" /><div className="dash-ticket-art"><div className="dash-ticket-art-content"><div className="dash-ticket-top"><span>ISIPATHANA COLLEGE</span><span>XXVI</span></div><div className="dash-ticket-pass"><Ticket size={14} aria-hidden="true" /><span>{confirmed ? 'DIGITAL ENTRY PASS' : 'RESERVATION RECORD'}</span></div><img className="dash-ticket-logo" src="/images/greens-heaven-logo.png" alt="Greens Heaven" width="425" height="179" /><p>One evening. The whole batch.</p><div className="dash-ticket-date"><strong>31 <span>OCT / 2026</span></strong><span>SOLIS HOTEL<br />5:30 PM ONWARDS</span></div></div></div>
          <div className="dash-ticket-owner"><div><span className="dash-eyebrow">RESERVED FOR</span><h2 className="dash-attendee-name" data-length={name.length > 55 ? 'long' : name.length > 28 ? 'medium' : 'short'}>{reservation.full_name}</h2><p>2023 O/L & 2026 A/L batch</p></div>{confirmed && <span className="dash-admit">01<small>PERSON</small></span>}</div>
          <div className="dash-ticket-stub"><div><span className="dash-eyebrow">{reservation.status === 'approved' ? 'TICKET REFERENCE' : 'RESERVATION REFERENCE'}</span><strong>{reservation.reference}</strong></div><button onClick={copyReference} className="dash-copy" aria-label="Copy reservation reference"><Copy size={18} /></button><div className="dash-ticket-price"><span>ONE TICKET</span><strong>{formatMoney(reservation.amount_lkr)}</strong></div></div>
          <div className="dash-ticket-caption"><StatusIcon size={15} /><span>{reservation.status === 'approved' ? 'Confirmed · Turn over for your ticket QR.' : 'Entry QR unlocks after organizer approval.'}</span></div>
        </article>
        </TicketFlipCard>
        {!confirmed && <div className="dash-ticket-next">
          <p>{reservation.status === 'pending_review' ? 'Your receipt is under review. No need to pay again.' : reservation.status === 'rejected' ? 'Check the organizer’s note before uploading a corrected receipt.' : 'Your details are saved. Transfer the payment and upload your receipt to continue.'}</p>
        </div>}
        <p className="dash-copy-feedback" role="status">{copyMessage}</p>
      </FadeContent>
      <div className="dash-status-column">
        <FadeContent trigger="mount" duration={.55} delay={.1}><BorderGlow className="dash-status-card"><span className={`dash-status-pill dash-status-${reservation.status}`}><StatusIcon size={14} />{state?.label || 'Status unavailable'}</span><h2>{state?.title || 'Check your reservation.'}</h2><p>{state?.description || 'Refresh your status or contact the organizers for an update.'}</p>
          {reservation.review_note && <div className="dash-organizer-note"><span>FROM THE ORGANIZERS</span><p>{reservation.review_note}</p></div>}
          <ol className="dash-timeline" aria-label="Reservation progress">{[
            { title: 'Your details', detail: 'Reservation saved', done: true },
            { title: 'Payment receipt', detail: reservation.status === 'rejected' ? 'A corrected receipt is needed' : reservation.status === 'awaiting_payment' ? 'Bank transfer and receipt upload' : 'Receipt submitted', done: ['pending_review', 'approved'].includes(reservation.status) },
            { title: 'Ticket confirmation', detail: reservation.status === 'approved' ? 'Payment approved by the organizers' : 'After organizer approval', done: reservation.status === 'approved' },
          ].map((step, i) => <li key={step.title} data-complete={step.done}><span className="dash-step-marker">{step.done ? <Check size={14} /> : `0${i + 1}`}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div></li>)}</ol>
          {state?.action && <a className="dash-primary" href="/payment">{state.action}<ArrowRight size={18} /></a>}
          <p className="dash-auto-update">Status updates automatically while this page is open.</p>
        </BorderGlow></FadeContent>
        <FadeContent duration={.45} delay={.15}><details className="dash-details"><summary>Your reservation details<span>View</span></summary><dl>{[['Email', reservation.email || user?.email], ['WhatsApp', reservation.whatsapp], ['NIC', reservation.nic_number], ['School index', reservation.school_index_number], ['Year joined', reservation.school_joined_year]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl><p>Need to correct a detail? Contact the organizers.</p></details></FadeContent>
      </div>
    </div>}
    <FadeContent className="dash-bottom-grid" stagger={.07} duration={.45}>
      <div><CalendarDays size={20} /><span className="dash-eyebrow">WHEN</span><h3>31 October 2026</h3><p>5:30 pm onwards</p></div>
      <div><MapPin size={20} /><span className="dash-eyebrow">WHERE</span><h3>Solis Hotel</h3><p>Back together, at last.</p></div>
      <a href="https://www.instagram.com/greens_heaven/" target="_blank" rel="noreferrer"><ArrowUpRight size={20} /><span className="dash-eyebrow">HERE TO HELP</span><h3>Talk to the organizers</h3><p>Include your GH reference if you have one.</p></a>
    </FadeContent>
  </div>
}
