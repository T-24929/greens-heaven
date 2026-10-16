import assert from 'node:assert/strict'
import test from 'node:test'
import { reservationWhatsappLink } from './admin-messages.js'

const reservation = {
  full_name: 'A & B',
  reference: 'GH-123456',
  whatsapp: '+94771234567',
  status: 'approved',
}

test('WhatsApp opens the international number with encoded approval text', () => {
  const link = new URL(reservationWhatsappLink(reservation))
  assert.equal(link.origin, 'https://wa.me')
  assert.equal(link.pathname, '/94771234567')
  assert.match(link.searchParams.get('text'), /Hi A & B,\n\n\*Your Greens Heaven XXVI ticket is confirmed!/)
  assert.match(link.searchParams.get('text'), /https:\/\/greensheavenxxvi.online\/dashboard/)
  assert.equal([...link.searchParams.keys()].length, 1)
})

test('rejection messages include the reason as text, not additional URL parameters', () => {
  const link = new URL(reservationWhatsappLink({
    ...reservation, status: 'rejected', review_note: 'Amount missing & other=example #detail',
  }))
  assert.match(link.searchParams.get('text'), /Amount missing & other=example #detail/)
  assert.equal(link.hash, '')
  assert.match(link.searchParams.get('text'), /https:\/\/greensheavenxxvi.online\/dashboard/)
  assert.equal([...link.searchParams.keys()].length, 1)
})

test('unreviewed reservations never produce a confirmation message', () => {
  for (const status of ['awaiting_payment', 'pending_review', '', 'unknown']) {
    assert.equal(reservationWhatsappLink({ ...reservation, status }), null)
  }
  assert.equal(reservationWhatsappLink(null), null)
})

test('invalid phone numbers cannot become WhatsApp URL destinations', () => {
  for (const whatsapp of ['0771234567', '+00000000', '+94/other', 'javascript:alert(1)', '+9477?text=other', '+14155550100', '+1234567890123456', '', null]) {
    assert.equal(reservationWhatsappLink({ ...reservation, whatsapp }), null)
  }
})
