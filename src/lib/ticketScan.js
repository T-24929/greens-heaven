const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function parseTicketScan(raw, origin) {
  const value = String(raw || '').trim()
  if (/^GH-\d{3,12}$/i.test(value) || uuid.test(value)) return value.toUpperCase().startsWith('GH-') ? value.toUpperCase() : value.toLowerCase()
  try {
    const url = new URL(value)
    const allowed = new Set(['https://greensheavenxxvi.online', 'https://www.greensheavenxxvi.online', origin])
    if (!allowed.has(url.origin) || url.pathname !== '/admin/dashboard' || !uuid.test(url.searchParams.get('ticket') || '')) throw new Error()
    return url.searchParams.get('ticket').toLowerCase()
  } catch { throw new Error('Use a Greens Heaven QR or a ticket reference such as GH-003.') }
}
