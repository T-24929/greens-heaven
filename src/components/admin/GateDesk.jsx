import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Plus,
  Save,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../utils/supabase.js'
import { parseTicketScan } from '../../lib/ticketScan.js'
import { useToast } from '../../lib/toasts.js'
import { OTPInput } from '../motion/otp-input.jsx'
import TicketPass from '../TicketPass.jsx'
import SlideActionButton from './SlideActionButton.jsx'
import TicketScanner from './TicketScanner.jsx'

const time = (value) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function GateDesk({ initialGate = 'entrance', lockedGate = null, adminMap = {}, onChange, onSelectTicket }) {
  const gate = lockedGate || initialGate || 'entrance'
  const [mobileView, setMobileView] = useState('scanner')
  const [ticketId, setTicketId] = useState('')
  const [ticket, setTicket] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completedGate, setCompletedGate] = useState(null)
  const [photoImageFields, setPhotoImageFields] = useState([{ id: 0, value: '' }])
  const [savingPhotoImages, setSavingPhotoImages] = useState(false)
  const photoImageFieldId = useRef(1)
  const lock = useRef(false)
  const toast = useToast()
  const reduceMotion = useReducedMotion()

  const photo = gate === 'photobooth'
  const label = photo ? 'Photo booth' : 'Entrance'
  const recorded = ticket?.attendance?.find((item) => item.gate === gate)
  const entranceRecorded = ticket?.attendance?.some(
    (item) => item.gate === 'entrance' && item.identity_checked === true
  ) || false
  const completionRecord = ticket?.attendance?.find((item) => item.gate === completedGate)
  const completedBy = completionRecord?.checked_in_by ? adminMap[completionRecord.checked_in_by] : null

  function makePhotoImageFields(values = []) {
    const nextFields = values.length
      ? values.map((value) => ({ id: photoImageFieldId.current++, value: String(value ?? '') }))
      : [{ id: photoImageFieldId.current++, value: '' }]
    setPhotoImageFields(nextFields)
  }

  async function lookup(raw) {
    if (lock.current) return

    const candidate = String(raw || '').trim()
    if (!candidate) return

    lock.current = true
    setBusy(true)
    setError('')
    setTicket(null)
    setCompletedGate(null)

    try {
      const parsed = parseTicketScan(candidate, window.location.origin)
      const { data, error: lookupError } = await supabase.rpc('lookup_event_ticket', {
        p_code: parsed,
      })

      if (lookupError) {
        throw new Error(
          lookupError.code === 'P0002'
            ? 'Ticket not found. Check the ID and try again.'
            : 'Could not verify this ticket. Check your connection and admin access.'
        )
      }

      const attendance = await loadAttendance(data.id, data.attendance || [])
      setTicket({ ...data, attendance })
      makePhotoImageFields(Array.isArray(data.images) ? data.images : [])
      if (
        (lockedGate || gate) === 'photobooth' &&
        attendance.some((item) => item.gate === 'entrance' && item.identity_checked === true) &&
        attendance.some((item) => item.gate === 'photobooth')
      ) {
        setCompletedGate('photobooth')
      }
      setMobileView('ticket')
    } catch (lookupError) {
      setError(lookupError.message || 'Could not verify this ticket.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function loadAttendance(reservationId, fallback = []) {
    try {
      const { data, error: attendanceError } = await supabase
        .from('ticket_attendance')
        .select('gate,checked_in_at,identity_checked,checked_in_by')
        .eq('reservation_id', reservationId)

      return attendanceError ? fallback : data || []
    } catch {
      return fallback
    }
  }

  function handleTicketIdChange(nextValue) {
    const value = String(nextValue || '')
    if (!/^\d{0,3}$/.test(value)) {
      setError('Enter the three-digit ticket ID only.')
      return
    }

    setTicketId(value)
    setError('')
  }

  async function checkIn() {
    if (!ticket || lock.current) return false

    lock.current = true
    setBusy(true)
    setError('')

    try {
      const { data, error: checkInError } = await supabase.rpc('check_in_ticket', {
        p_reservation_id: ticket.id,
        p_gate: gate,
        p_identity_checked: true,
      })

      if (checkInError) {
        throw new Error(checkInError.message || 'Check-in was not confirmed. Look up the ticket again before retrying.')
      }

      const fallbackAttendance = [
        ...(ticket.attendance || []).filter((item) => item.gate !== gate),
        {
          gate,
          checked_in_at: data?.checked_in_at,
          identity_checked: true,
        },
      ]
      const attendance = await loadAttendance(ticket.id, fallbackAttendance)
      setTicket((current) => current ? { ...current, attendance } : current)

      toast.show({
        status: 'success',
        title: data?.already_recorded ? `${label} already recorded` : `${label} check-in saved`,
      })
      onChange?.()
      setCompletedGate(gate)
      return true
    } catch (checkInError) {
      setError(checkInError.message || 'Check-in could not be saved.')
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function addPhotoImageField() {
    setPhotoImageFields((current) => [
      ...current,
      { id: photoImageFieldId.current++, value: '' },
    ])
  }

  function updatePhotoImageField(id, value) {
    setPhotoImageFields((current) => current.map((field) => field.id === id ? { ...field, value } : field))
  }

  function removePhotoImageField(id) {
    setPhotoImageFields((current) => current.length > 1 ? current.filter((field) => field.id !== id) : current)
  }

  async function savePhotoImages() {
    if (!ticket || savingPhotoImages) return false

    setSavingPhotoImages(true)
    setError('')
    try {
      const imageNames = photoImageFields.map((field) => field.value.trim()).filter(Boolean)
      const { data, error: saveError } = await supabase.rpc('save_ticket_images', {
        p_reservation_id: ticket.id,
        p_images: imageNames,
      })
      if (saveError) throw saveError

      const savedImages = Array.isArray(data) ? data : imageNames
      setTicket((current) => current ? { ...current, images: savedImages } : current)
      makePhotoImageFields(savedImages)
      toast.show({ status: 'success', title: 'Photo names saved' })
      return true
    } catch (saveError) {
      const missingImageRpc = ['PGRST202', 'PGRST203'].includes(saveError?.code)
        || /could not find the function.*schema cache/i.test(saveError?.message || '')
      setError(missingImageRpc
        ? 'Photo-name saving is not available yet. Apply the latest attendance image migration, then refresh this page.'
        : saveError.message || 'Photo names could not be saved.')
      toast.show({ status: 'error', title: 'Photo names could not be saved' })
      return false
    } finally {
      setSavingPhotoImages(false)
    }
  }

  function clearTicket() {
    setTicket(null)
    setTicketId('')
    setError('')
    setCompletedGate(null)
    makePhotoImageFields([])
    setMobileView('scanner')
  }

  return (
    <div className="admin-attendance-container">
      <header className="admin-attendance-heading">
        <div>
          <p className="admin-eyebrow">GATE {photo ? '02' : '01'} · {label.toUpperCase()}</p>
          <h2>{label}</h2>
          <p className="muted">Scan a QR code or enter its ID.</p>
        </div>
        <a className="admin-attendance-back-link" href="/admin/dashboard/attendance">
          <ArrowLeft size={16} aria-hidden="true" />
          All gates
        </a>
      </header>

      <div
        id="attendance-desk-panel"
        className="admin-bento-grid admin-attendance-grid"
        aria-label={`${label} attendance scanner`}
      >
        <section
          className={`admin-bento-card admin-bento-scanner-card ${
            mobileView === 'ticket' ? 'admin-panel-hidden-mobile' : ''
          }`}
          aria-label="Ticket scanner and ID lookup"
        >
          <TicketScanner onScan={lookup} />

          <div className="admin-id-lookup">
            <div className="admin-id-lookup-copy">
              <label htmlFor="gate-otp-code">Reservation ID</label>
            </div>

            <form
              className="admin-bento-otp-form"
              onSubmit={(event) => {
                event.preventDefault()
                if (ticketId.length === 3) {
                  lookup(`GH-${ticketId.padStart(3, '0')}`)
                }
              }}
            >
              <div className="admin-bento-otp-group">
                <span className="admin-bento-prefix-badge" aria-hidden="true">GH-</span>
                <OTPInput
                  id="gate-otp-code"
                  name="reservation-id"
                  length={3}
                  value={ticketId}
                  onChange={handleTicketIdChange}
                  placeholder="000"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={busy}
                  error={error}
                  aria-describedby="gate-id-help"
                />
              </div>

              <button
                type="submit"
                className="admin-bento-submit-pill"
                disabled={busy || ticketId.length !== 3}
              >
                <ScanLine size={16} />
                <span>{busy ? 'Checking…' : 'Look up'}</span>
              </button>
            </form>
            <span id="gate-id-help" className="sr-only">
              Enter the three digits after GH dash to find this reservation.
            </span>
          </div>

          {error && !ticket && <p className="admin-error" role="alert">{error}</p>}
        </section>

        <motion.section
          layout
          transition={{ layout: reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 34 } }}
          className={`admin-bento-card admin-bento-attendee-card ${
            ticket ? 'admin-attendance-ticket-shell' : ''
          } ${!ticket && mobileView === 'scanner' ? 'admin-panel-hidden-mobile' : ''}`}
          aria-label="Attendee check-in"
        >
          {ticket ? (
            <AnimatePresence mode="wait" initial={false}>
              {completedGate === gate ? (
                photo ? (
                  <motion.div
                    key={`photo-session-${ticket.id}`}
                    className="admin-attendance-ticket-enter"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                  >
                    <TicketPass
                      reservation={ticket}
                      confirmed
                      variant="attendance"
                      ownerSubtitle="Photo session"
                      showPrice={false}
                      caption={null}
                      passLabel="PHOTO BOOTH SESSION"
                      artAction={(
                        <button
                          type="button"
                          className="admin-attendance-clear"
                          onClick={clearTicket}
                          aria-label="Close photo session"
                        >
                          <X size={22} aria-hidden="true" />
                        </button>
                      )}
                    >
                      <form
                        className="admin-photo-session"
                        onSubmit={(event) => {
                          event.preventDefault()
                          savePhotoImages()
                        }}
                      >
                        <div className="admin-photo-session-heading">
                          <div>
                            <h3>Image names <span>Optional</span></h3>
                          </div>
                          <button
                            type="button"
                            className="admin-photo-add"
                            onClick={addPhotoImageField}
                            aria-label="Add another image name"
                            title="Add image name"
                          >
                            <Plus size={17} aria-hidden="true" />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {photoImageFields.map((field, index) => {
                            const inputId = `photo-image-name-${field.id}`
                            return (
                              <motion.div
                                key={field.id}
                                className="admin-photo-image-field"
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
                                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                              >
                                <label htmlFor={inputId}>Image {index + 1}</label>
                                <div className="admin-photo-image-input-row">
                                  <input
                                    id={inputId}
                                    type="text"
                                    value={field.value}
                                    maxLength={500}
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    placeholder="Image filename"
                                    onChange={(event) => updatePhotoImageField(field.id, event.target.value)}
                                  />
                                  {photoImageFields.length > 1 && (
                                    <button
                                      type="button"
                                      className="admin-photo-remove"
                                      onClick={() => removePhotoImageField(field.id)}
                                      aria-label={`Remove image ${index + 1}`}
                                      title="Remove image name"
                                    >
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>

                        {error && <p className="admin-error" role="alert">{error}</p>}

                        <div className="admin-photo-session-actions">
                          <button type="submit" className="admin-photo-save" disabled={savingPhotoImages}>
                            <Save size={16} aria-hidden="true" />
                            {savingPhotoImages ? 'Saving…' : 'Save names'}
                          </button>
                          <button type="button" className="admin-attendance-next" onClick={clearTicket}>
                            <ScanLine size={16} aria-hidden="true" />
                            Next guest
                          </button>
                        </div>
                      </form>
                    </TicketPass>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`checked-${ticket.id}-${gate}`}
                    className="admin-attendance-success"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    role="status"
                    aria-live="polite"
                  >
                    <div className="admin-attendance-success-brand">
                      <img src="/images/greens-heaven-logo.png" alt="Greens Heaven" />
                      <span>XXVI · {label.toUpperCase()}</span>
                    </div>
                    <span className="admin-attendance-success-mark"><CheckCircle2 size={28} /></span>
                    <p className="dash-eyebrow">CHECK-IN RECORDED</p>
                    <h3>{label} confirmed</h3>
                    <p className="admin-attendance-success-person">{ticket.full_name}</p>
                    <span className="admin-attendance-success-meta">
                      {ticket.reference}
                      {completionRecord?.checked_in_at && ` · ${time(completionRecord.checked_in_at)}`}
                      {completedBy && ` · by ${completedBy}`}
                    </span>
                    <button type="button" className="admin-attendance-next" onClick={clearTicket}>
                      <ScanLine size={17} aria-hidden="true" />
                      Next attendee
                    </button>
                  </motion.div>
                )
              ) : (
                <motion.div
                  key={`ticket-${ticket.id}-${gate}`}
                  className="admin-attendance-ticket-enter"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.99 }}
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                >
                  <TicketPass
                    reservation={ticket}
                    confirmed={ticket.status === 'approved'}
                    statusIcon={ticket.status === 'approved' ? CheckCircle2 : AlertCircle}
                    variant="attendance"
                    ownerSubtitle={null}
                    showPrice={false}
                    caption={null}
                    passLabel={ticket.status === 'approved' ? 'DIGITAL ENTRY PASS' : 'RESERVATION RECORD'}
                    ticketNotice={<><AlertCircle size={15} aria-hidden="true" /><span>Not confirmed · check-in unavailable</span></>}
                    artAction={(
                      <button
                        type="button"
                        className="admin-attendance-clear"
                        onClick={clearTicket}
                        aria-label="Clear attendee details"
                      >
                        <X size={24} aria-hidden="true" />
                      </button>
                    )}
                    onCopyReference={async () => {
                      try {
                        await navigator.clipboard.writeText(ticket.reference)
                        toast.show({ status: 'success', title: 'Ticket ID copied' })
                      } catch {
                        setError('Could not copy ticket ID.')
                      }
                    }}
                  >
                    <div className="admin-attendance-ticket-details" aria-live="polite">
                      <div className="admin-gate-status-pills" aria-label="Gate check-in status">
                        {[gate].map((key) => {
                          const gateRecord = ticket.attendance?.find((item) => item.gate === key)
                          const gateName = key === 'entrance' ? 'Entrance' : 'Photo booth'
                          const checker = gateRecord?.checked_in_by ? adminMap[gateRecord.checked_in_by] : null
                          const checkedAt = gateRecord?.checked_in_at ? time(gateRecord.checked_in_at) : null
                          const verified = gateRecord?.identity_checked === true
                          const statusLabel = verified ? 'Checked' : gateRecord ? 'ID check' : 'Pending'
                          const checkDetails = gateRecord
                            ? verified
                              ? `${gateName} checked${checker ? ` by ${checker}` : ''}${checkedAt ? ` · ${checkedAt}` : ''}`
                              : `${gateName} was recorded; verify attendee ID`
                            : `${gateName} pending`

                          return (
                            <span
                              key={key}
                              className={`admin-gate-status-chip ${verified ? 'done' : ''} ${gateRecord && !verified ? 'needs-id-check' : ''} active-gate`}
                              aria-label={checkDetails}
                              title={checkDetails}
                            >
                              {gateRecord ? <Check size={12} aria-hidden="true" /> : <span className="admin-gate-status-dot" aria-hidden="true" />}
                              <span>{gateName} · {statusLabel}</span>
                            </span>
                          )
                        })}
                      </div>

                      {ticket.status !== 'approved' ? (
                        <div className="admin-unapproved-box">
                          <AlertCircle size={16} aria-hidden="true" />
                          <span>Ticket is not confirmed</span>
                        </div>
                      ) : photo && !entranceRecorded ? (
                        <div className="admin-gate-prerequisite" role="status">
                          <span className="admin-gate-prerequisite-icon">
                            <LockKeyhole size={17} aria-hidden="true" />
                          </span>
                          <span className="admin-gate-prerequisite-copy">
                            <strong>Entrance check-in required</strong>
                            <small>Record entrance before opening this photo session.</small>
                          </span>
                          <a href="/admin/dashboard/attendance/entrance" aria-label="Go to entrance check-in">
                            <ArrowRight size={17} aria-hidden="true" />
                          </a>
                        </div>
                      ) : recorded?.identity_checked === true ? (
                        <div className="admin-attendance-recorded">
                          <CheckCircle2 size={17} aria-hidden="true" />
                          <span><strong>{label} admitted</strong><small>{time(recorded.checked_in_at)}</small></span>
                        </div>
                      ) : (
                        <div className="admin-attendance-ticket-actions">
                          <SlideActionButton
                            disabled={busy}
                            onComplete={checkIn}
                            completeLabel={recorded ? `${label} identity verified` : `${label} recorded`}
                          >
                            {recorded
                              ? 'Slide to verify attendee ID'
                              : photo
                                ? 'Slide to verify ID & open session'
                                : 'Slide to verify ID & confirm entrance'}
                          </SlideActionButton>
                          {onSelectTicket && (
                            <button
                              type="button"
                              className="admin-attendance-record-link"
                              onClick={() => onSelectTicket(ticket.id)}
                              aria-label="View attendee record"
                              title="View attendee record"
                            >
                              <FileText size={17} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}

                      {error && <p className="admin-error" role="alert">{error}</p>}
                    </div>
                  </TicketPass>
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <div className="admin-bento-standby-content" role="status" aria-live="polite">
              <div className="admin-bento-standby-body">
                <span className="admin-standby-ready-label"><span aria-hidden="true" /> SCANNER READY</span>
                <div className="admin-standby-halo">
                  <ScanLine size={25} />
                </div>
                <h3 className="admin-bento-standby-title">Ready for next guest</h3>
                <p className="admin-bento-standby-desc">Scan a ticket QR or enter its ID on the left.</p>
              </div>
            </div>
          )}
        </motion.section>
      </div>

    </div>
  )
}
