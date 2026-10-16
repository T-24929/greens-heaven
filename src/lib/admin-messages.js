export function reservationWhatsappLink(reservation) {
  if (!reservation || !['approved', 'rejected'].includes(reservation.status)) return null
  if (!/^\+947\d{8}$/.test(reservation.whatsapp ?? '')) return null

  const greeting = `Hi ${reservation.full_name},`
  const dashboard = 'https://greensheavenxxvi.online/dashboard'
  const message = reservation.status === 'approved'
    ? [greeting, '', '*Your Greens Heaven XXVI ticket is confirmed!*', '',
      `Ticket: *${reservation.reference}*`,
      'Date: 31 October 2026', 'Time: 5:30 pm onwards', 'Venue: Solis Hotel',
      'Isipathana College · 2023 O/L & 2026 A/L batch', '',
      'View your ticket and entry QR:', dashboard, '',
      'Sign in with the account you used to reserve. Keep your QR ready at the entrance.', '',
      'See you at Solis!', 'Greens Heaven organizing team'].join('\n')
    : [greeting, '', `Your receipt for *${reservation.reference}* needs attention.`, '',
      reservation.review_note || 'Please check your payment receipt.', '',
      'Upload a replacement receipt from your dashboard:', dashboard, '',
      'Your ticket will be confirmed after the organizers approve your payment.', '',
      'Greens Heaven organizing team'].join('\n')

  return `https://wa.me/${reservation.whatsapp.slice(1)}?text=${encodeURIComponent(message)}`
}
