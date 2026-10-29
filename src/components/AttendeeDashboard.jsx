import { useToast } from '../lib/toasts.js'
import ReservationProgress from './ReservationProgress.jsx'
import { useState } from 'react'
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock3,
  RefreshCw,
  CalendarDays,
  MapPin,
  ShieldCheck,
  Ticket,
  AlertCircle,
  LockKeyhole,
} from 'lucide-react'
import FadeContent from './FadeContent.jsx'
import BorderGlow from './BorderGlow.jsx'
import LiveAttendancePass from './LiveAttendancePass.jsx'
import TicketFlipCard from './TicketFlipCard.jsx'
import TicketPass from './TicketPass.jsx'
import { Notice } from './Feedback.jsx'
import { formatMoney } from '../lib/tickets.js'
import '../pages/Dashboard.css'

const states = {
  awaiting_payment: { label: 'Awaiting payment receipt', title: 'Your place is reserved.', description: 'Make your bank transfer, then upload the receipt. The organizers will confirm your ticket after checking it.', action: 'Continue to payment', icon: Clock3 },
  pending_review: { label: 'Under review', title: 'Over to the organizers.', description: 'Your receipt has been submitted. You don’t need to pay again. Your status will update here after the organizers review it.', icon: Clock3 },
  approved: { label: 'Ticket confirmed', title: 'See you at Solis.', description: 'Your payment is approved. Turn your ticket over to show the QR, or save the code to your phone. Keep your reference handy for the organizers.', icon: ShieldCheck },
  rejected: { label: 'Receipt needs attention', title: 'One thing to sort out.', description: 'Read the organizer’s note and upload a corrected receipt. Check with the organizers before making another payment.', action: 'Update receipt', icon: AlertCircle },
}
const physicalCashStates = {
  awaiting_payment: { label: 'Physical cash due', title: 'Your place is reserved.', description: 'Your details are saved. Pay an organizer in person. Your ticket will be confirmed when the collector records the payment.', icon: Clock3 },
  pending_review: { label: 'Physical cash under review', title: 'Your payment is recorded.', description: 'An organizer recorded your cash payment. You do not need to pay again while the organizers review it.', icon: Clock3 },
  approved: states.approved,
  rejected: { label: 'Cash payment needs attention', title: 'Please check with the organizers.', description: 'The cash record needs correction. Contact the organizers before paying again.', action: 'Review payment options', icon: AlertCircle },
}

export default function AttendeeDashboard({ user, reservation, event, attendance, error, onRefresh }) {
  const toast = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const cashPayment = reservation?.payment_method === 'cash'
  const state = (cashPayment ? physicalCashStates : states)[reservation?.status]
  const StatusIcon = state?.icon || Ticket
  const name = reservation?.full_name?.trim()
  const confirmed = reservation?.status === 'approved'

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const mockGate = urlParams?.get('preview_gate')
  const hasEntrance = Boolean(attendance?.has_entrance || mockGate === 'entrance' || mockGate === 'both')
  const hasPhotobooth = Boolean(attendance?.has_photobooth || mockGate === 'both')
  const hasEntranceOnly = hasEntrance && !hasPhotobooth
  const hasBothGates = hasEntrance && hasPhotobooth

  // Party scheduled for 31 October 2026. Concludes around 9:00 PM (21:00 Colombo time).
  const [isPartyEnded] = useState(() => {
    const eventEndTime = new Date('2026-10-31T21:00:00+05:30').getTime()
    return (Date.now() >= eventEndTime) || Boolean(urlParams?.has('ended') || urlParams?.get('preview') === 'ended')
  })

  const ticketMessage = hasBothGates
    ? 'All gates verified · Entrance & Photo Booth recorded'
    : hasEntranceOnly
      ? 'Admitted at entrance · Photo booth pending'
      : cashPayment
        ? reservation?.status === 'approved' ? 'Physical cash received · Ticket confirmed'
          : reservation?.status === 'pending_review' ? 'Physical cash recorded · Awaiting approval'
            : reservation?.status === 'rejected' ? 'Cash record needs attention · Not confirmed' : 'Physical cash due · Not confirmed'
        : reservation?.status === 'pending_review' ? 'Receipt received · Awaiting approval' : reservation?.status === 'rejected' ? 'Receipt needs attention · Not confirmed' : 'Awaiting payment receipt'

  const ticketCaption = isPartyEnded
    ? 'Greens Heaven XXVI · Concluded with wonderful memories.'
    : hasBothGates
      ? 'Admitted · Enjoy the party at Solis!'
      : hasEntranceOnly
        ? 'Admitted · Make sure to visit the Photo Booth next.'
        : reservation?.status === 'approved'
          ? 'Confirmed · Turn over for your ticket QR.'
          : 'Entry QR unlocks after organizer approval.'

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
    {!reservation ? <FadeContent duration={.55} trigger="mount" className="dash-empty"><img className="dash-empty-art" src="/images/hero-grass.png" alt="Greens Heaven event artwork" width="1080" height="1350" /><div className="dash-empty-content"><span className="dash-empty-icon"><Ticket size={24} /></span><p className="dash-eyebrow">THE NEXT STEP IS YOURS</p><h2>A ticket. A whole<br /><em>lot to catch up on.</em></h2><p>{user ? 'Save your details, make your transfer and leave the receipt with us. You can follow every step here.' : 'Sign in to reserve your place and keep your payment updates together.'}</p><div className="dash-empty-action"><a className="dash-primary" href={user ? '/reserve' : '/login'}>{user ? 'Reserve my ticket' : 'Sign in to continue'}<ArrowRight size={18} /></a><span className="dash-caption">One person · {formatMoney(event?.ticket_price_lkr || 7000)}</span></div></div></FadeContent> : <div className="dashboard-grid">
      <FadeContent trigger="mount" duration={.65} className="dash-ticket-column">
        {confirmed && (hasEntrance || isPartyEnded) && (
          <LiveAttendancePass
            hasEntranceOnly={hasEntranceOnly}
            hasBothGates={hasBothGates}
            isPartyEnded={isPartyEnded}
            attendance={attendance}
            reservation={reservation}
          />
        )}
        <TicketFlipCard key={`${reservation.id}-${reservation.status}`} reservation={reservation} actions={<><button title="Refresh ticket status" className="dash-refresh dash-refresh-icon" onClick={refresh} disabled={refreshing} aria-label="Refresh ticket status"><RefreshCw size={16} className={refreshing ? 'dash-spin' : ''} /></button>
          <a className="dash-calendar" href="/greens-heaven.ics" download><CalendarDays size={16} />Save the date</a>
        </>}>
        <TicketPass
          reservation={reservation}
          confirmed={confirmed}
          ariaLabel={confirmed ? 'Your confirmed ticket' : 'Your reservation — not an entry ticket'}
          statusIcon={StatusIcon}
          onCopyReference={copyReference}
          ticketNotice={<><LockKeyhole size={16} /><span>{ticketMessage}</span></>}
          caption={ticketCaption}
        />
        </TicketFlipCard>
        {!confirmed && <div className="dash-ticket-next">
          <p>{cashPayment
            ? reservation.status === 'pending_review' ? 'Your physical cash payment has been recorded. No need to pay again while it is under review.' : reservation.status === 'rejected' ? 'Check the organizer’s note and contact the organizers before making another payment.' : 'Your details are saved. Pay an organizer in person; your ticket is confirmed when the collector records the payment.'
            : reservation.status === 'pending_review' ? 'Your receipt is under review. No need to pay again.' : reservation.status === 'rejected' ? 'Check the organizer’s note before uploading a corrected receipt.' : 'Your details are saved. Transfer the payment and upload your receipt to continue.'}</p>
        </div>}
        <p className="dash-copy-feedback" role="status">{copyMessage}</p>
      </FadeContent>
      <div className="dash-status-column">

        <FadeContent trigger="mount" duration={.55} delay={.1}><BorderGlow className="dash-status-card"><span className={`dash-status-pill dash-status-${reservation.status}`}><StatusIcon size={14} />{state?.label || 'Status unavailable'}</span><h2>{state?.title || 'Check your reservation.'}</h2><p>{state?.description || 'Refresh your status or contact the organizers for an update.'}</p>
          {reservation.review_note && <div className="dash-organizer-note"><span>FROM THE ORGANIZERS</span><p>{reservation.review_note}</p></div>}
          <ol className="dash-timeline" aria-label="Reservation progress">{[
            { title: 'Your details', detail: 'Reservation saved', done: true },
            { title: cashPayment ? 'Physical cash' : 'Payment receipt', detail: cashPayment ? reservation.status === 'rejected' ? 'Cash record needs attention' : reservation.status === 'awaiting_payment' ? 'Pay an organizer in person' : 'Collected by an organizer' : reservation.status === 'rejected' ? 'A corrected receipt is needed' : reservation.status === 'awaiting_payment' ? 'Bank transfer and receipt upload' : 'Receipt submitted', done: ['pending_review', 'approved'].includes(reservation.status) },
            { title: 'Ticket confirmation', detail: reservation.status === 'approved' ? cashPayment ? 'Physical cash confirmed' : 'Payment approved by the organizers' : 'After organizer approval', done: reservation.status === 'approved' },
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
