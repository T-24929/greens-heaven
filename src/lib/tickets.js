export const EVENT_ID = 'greens-heaven-2026'
export const EVENT = {
  name: 'Greens Heaven',
  starts_at: '2026-10-31T17:30:00+05:30',
  venue: 'Solis Hotel',
  ticket_price_lkr: 7000,
}

export const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  pending_review: 'Payment under review',
  approved: 'Ticket confirmed',
  rejected: 'Payment needs attention',
}

export function formatMoney(amount) {
  return `Rs. ${new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(amount)}`
}

export function normalizePhone(value) {
  const cleaned = value.trim().replace(/[\s()-]/g, '')
  const local = cleaned.replace(/^\+94(?:0)?/, '0')
  if (!/^07\d{8}$/.test(local)) throw new Error('Enter a valid Sri Lankan mobile number, such as 077 123 4567.')
  return `+94${local.slice(1)}`
}

export function normalizeNic(value) {
  const nic = value.trim().replace(/[\s-]/g, '').toUpperCase()
  if (!/^(?:\d{9}[VX]|\d{12})$/.test(nic)) throw new Error('Enter a valid Sri Lankan NIC: 9 digits plus V/X, or 12 digits.')
  return nic
}

export function normalizeSchoolIndex(value) {
  const index = value.trim()
  if (!index) return null
  if (!/^\d{5}$/.test(index)) throw new Error('Enter your 5-digit school index number, or leave it blank.')
  return index
}

export function normalizeFullName(name) {
  const fullName = name.trim()
  if (fullName.length < 2 || fullName.length > 100 || [...fullName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('Enter your full name using 2 to 100 characters.')
  }
  return fullName
}

export function normalizeJoinedYear(schoolJoinedYear) {
  const joinedYear = Number(schoolJoinedYear)
  if (!Number.isInteger(joinedYear) || joinedYear < 2010 || joinedYear > 2026) throw new Error('Choose the year you joined Isipathana College.')
  return joinedYear
}

export function validateAttendee(name, phone, nic, schoolIndex, schoolJoinedYear) {
  const fullName = normalizeFullName(name)
  const joinedYear = normalizeJoinedYear(schoolJoinedYear)
  return {
    fullName,
    whatsapp: normalizePhone(phone),
    nicNumber: normalizeNic(nic),
    schoolIndexNumber: normalizeSchoolIndex(schoolIndex),
    schoolJoinedYear: joinedYear,
  }
}

export async function validateReceipt(file, maxBytes = 5 * 1024 * 1024) {
  if (!file || file.size === 0) throw new Error('Choose a receipt to upload.')
  if (file.size > maxBytes) throw new Error(`Your receipt must be ${maxBytes / 1024 / 1024} MB or smaller.`)
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }
  const ext = types[file.type]
  if (!ext) throw new Error('Use a JPG, PNG, or PDF receipt.')
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const matches = ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : ext === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
      : [37, 80, 68, 70, 45].every((v, i) => bytes[i] === v)
  if (!matches) throw new Error('This file does not match its file type. Export the receipt as a JPG, PNG, or PDF.')
  return ext
}

export function friendlyError(error) {
  const message = error?.message || ''
  if (error?.code === '23505') {
    if (message.includes('reservations_event_nic_unique')) return 'This NIC is already linked to a reservation. Use the original account or contact the organizers.'
    if (message.includes('reservations_event_school_index_unique')) return 'This school index is already linked to a reservation. Check the number or contact the organizers.'
    if (message.includes('reservations_event_email_unique')) return 'This email already has a reservation. Sign in to the original account or contact the organizers.'
    return 'A reservation already exists for these details. Open your dashboard or contact the organizers.'
  }
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email using the link in your inbox, then sign in.'
  if (/password.*(character|weak|short)/i.test(message)) return 'Password must be at least 6 characters.'
  if (/different.*password|same.*password/i.test(message)) return 'Please choose a new password that is different from your current one.'
  if (/already registered|already exists/i.test(message)) return 'An account already exists for this email. Sign in instead.'
  if (/code verifier|pkce/i.test(message)) return 'Please open the sign-in link in the same browser where you requested it.'
  if (/expired.*(link|otp|token)|(link|otp|token).*expired/i.test(message)) return 'This sign in link has expired. Please request a new one.'
  if (/rate|too many|security purposes/i.test(message)) return 'Too many attempts. Please wait a moment and try again.'
  if (/fetch|network/i.test(message)) return 'We could not reach the server. Check your connection and try again.'
  if (/schema cache|does not exist|PGRST/i.test(message)) return 'Reservations are not available yet. Please try again later.'
  if (/bank details/i.test(message)) return 'Bank details are not available yet. Please check back before paying.'
  if (/not open|closed/i.test(message)) return 'Ticket reservations are currently closed.'
  if (/not pending|already reviewed|state|status/i.test(message)) return 'This reservation has changed. Refresh to see its latest status.'
  if (/email.*verified|confirmed.*email|verified.*email/i.test(message)) return 'Please verify your email before reserving a ticket.'
  return 'We could not complete this request. Please try again. If it continues, contact the organizers.'
}
