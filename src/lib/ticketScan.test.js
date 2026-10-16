import test from 'node:test'
import assert from 'node:assert/strict'
import { parseTicketScan } from './ticketScan.js'
const id = '11111111-1111-4111-8111-111111111111'
test('scanner accepts references and both issued QR formats', () => {
  assert.equal(parseTicketScan(' gh-003 '), 'GH-003')
  assert.equal(parseTicketScan(`https://greensheavenxxvi.online/admin/dashboard?ticket=${id}`), id)
  assert.equal(parseTicketScan(`https://greensheavenxxvi.online/admin/dashboard?ticket=${id}&reference=GH-003`), id)
  assert.equal(parseTicketScan(`http://localhost:5173/admin/dashboard?ticket=${id}`, 'http://localhost:5173'), id)
})
test('scanner rejects unrelated URLs and malformed ticket payloads', () => {
  for (const value of [`https://evil.example/admin/dashboard?ticket=${id}`, `https://greensheavenxxvi.online/payment?ticket=${id}`, 'javascript:alert(1)', 'GH-3', '', 'not a ticket']) assert.throws(() => parseTicketScan(value))
})
