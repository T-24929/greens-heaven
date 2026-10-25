import { Copy, Ticket } from 'lucide-react'
import { formatMoney } from '../lib/tickets.js'
import '../pages/Dashboard.css'

export default function TicketPass({
  reservation,
  confirmed = reservation?.status === 'approved',
  ariaLabel = confirmed ? 'Confirmed ticket' : 'Reservation record',
  statusIcon: StatusIcon,
  caption = null,
  onCopyReference,
  variant = 'dashboard',
  ownerSubtitle = '2023 O/L & 2026 A/L batch',
  passLabel = confirmed ? 'DIGITAL ENTRY PASS' : 'RESERVATION RECORD',
  ticketNotice = null,
  showPrice = variant !== 'attendance',
  artAction = null,
  children,
}) {
  const name = reservation?.full_name?.trim() || 'Guest'
  const reference = reservation?.reference || ''
  const longName = name.length > 55 ? 'long' : name.length > 28 ? 'medium' : 'short'

  return (
    <article
      className={`dash-ticket ${confirmed ? 'dash-ticket-confirmed' : 'dash-ticket-unconfirmed'} ${variant === 'attendance' ? 'dash-ticket-attendance' : ''}`}
      aria-label={ariaLabel}
    >
      {!confirmed && (
        <div className="dash-ticket-unconfirmed-label">
          {ticketNotice || <span>{reservation?.payment_method === 'cash'
            ? reservation?.status === 'pending_review' ? 'Physical cash recorded · Awaiting approval' : reservation?.status === 'rejected' ? 'Cash record needs attention' : 'Awaiting physical cash'
            : reservation?.status === 'pending_review' ? 'Receipt received · Awaiting approval' : 'Awaiting payment receipt'}</span>}
        </div>
      )}

      <div className="dash-ticket-frost" aria-hidden="true"><i /><i /></div>
      <img className="dash-ticket-photo" src="/images/hero-grass.png" alt="" width="1080" height="1350" />
      <div className="dash-ticket-art">
        <div className="dash-ticket-art-content">
          <div className="dash-ticket-top"><span>ISIPATHANA COLLEGE</span>{artAction || <span>XXVI</span>}</div>
          <div className="dash-ticket-pass"><Ticket size={14} aria-hidden="true" /><span>{passLabel}</span></div>
          <img className="dash-ticket-logo" src="/images/greens-heaven-logo.png" alt="Greens Heaven" width="425" height="179" />
          <p>One evening. The whole batch.</p>
          <div className="dash-ticket-date">
            <strong>31 <span>OCT / 2026</span></strong>
            <span>SOLIS HOTEL<br />5:30 PM ONWARDS</span>
          </div>
        </div>
      </div>

      <div className="dash-ticket-owner">
        <div>
          <span className="dash-eyebrow">RESERVED FOR</span>
          <h2 className="dash-attendee-name" data-length={longName}>{name}</h2>
          {ownerSubtitle && <p>{ownerSubtitle}</p>}
        </div>
        {confirmed && <span className="dash-admit">01<small>PERSON</small></span>}
      </div>

      <div className="dash-ticket-stub">
        <div>
          <span className="dash-eyebrow">{confirmed ? 'TICKET REFERENCE' : 'RESERVATION REFERENCE'}</span>
          <strong>{reference}</strong>
        </div>
        {onCopyReference && (
          <button type="button" onClick={onCopyReference} className="dash-copy" aria-label="Copy reservation reference">
            <Copy size={18} aria-hidden="true" />
          </button>
        )}
        {showPrice && (
          <div className="dash-ticket-price">
            <span>ONE TICKET</span>
            <strong>{reservation?.amount_lkr ? formatMoney(reservation.amount_lkr) : ''}</strong>
          </div>
        )}
      </div>

      {children}

      {caption != null && (
        <div className="dash-ticket-caption">
          {StatusIcon && <StatusIcon size={15} aria-hidden="true" />}
          <span>{caption}</span>
        </div>
      )}
    </article>
  )
}
