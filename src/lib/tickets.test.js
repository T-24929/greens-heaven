import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError, normalizeJoinedYear, normalizeNic, normalizePhone, normalizeSchoolIndex, validateAttendee, validateReceipt } from './tickets.js'

test('Sri Lankan mobile numbers normalize safely without requiring a country code', () => {
  assert.equal(normalizePhone('077 123 4567'), '+94771234567')
  assert.equal(normalizePhone('+94 (77) 123-4567'), '+94771234567')
  assert.equal(normalizePhone('+94 077 123 4567'), '+94771234567')
  assert.throws(() => normalizePhone('+1 415 555 0100'))
  assert.throws(() => normalizePhone('javascript:alert(1)'))
  assert.throws(() => normalizePhone('+00001234567'))
  assert.throws(() => normalizePhone('123'))
})
test('attendee names reject control characters and enforce length', () => {
  assert.deepEqual(validateAttendee('  Nimal Perera ', '0771234567', '200001234567', '24929', '2013'), {
    fullName: 'Nimal Perera', whatsapp: '+94771234567', nicNumber: '200001234567',
    schoolIndexNumber: '24929', schoolJoinedYear: 2013,
  })
  assert.throws(() => validateAttendee('Nimal\nBcc: email', '0771234567', '200001234567', '24929', '2013'))
  assert.throws(() => validateAttendee('X', '0771234567', '200001234567', '24929', '2013'))
  assert.throws(() => validateAttendee('A'.repeat(101), '0771234567', '200001234567', '24929', '2013'))
})
test('Sri Lankan NIC formats and five-digit school index are normalized and validated', () => {
  assert.equal(normalizeNic('855420159v'), '855420159V')
  assert.equal(normalizeNic('19 85542 00 159'), '198554200159')
  assert.throws(() => normalizeNic('12345678V'))
  assert.throws(() => normalizeNic('123456789Q'))
  assert.throws(() => normalizeSchoolIndex('2487'))
  assert.throws(() => normalizeSchoolIndex('24A29'))
  assert.equal(normalizeSchoolIndex(''), null)
})
test('receipt content must match its supported declared type', async () => {
  assert.equal(await validateReceipt(new Blob(['%PDF-1.7 sample'], { type: 'application/pdf' })), 'pdf')
  assert.equal(await validateReceipt(new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' })), 'png')
  assert.equal(await validateReceipt(new Blob([new Uint8Array([255,216,255,224])], { type: 'image/jpeg' })), 'jpg')
  await assert.rejects(validateReceipt(new Blob(['<svg onload="alert(1)">'], { type: 'image/png' })))
  await assert.rejects(validateReceipt(new Blob(['anything'], { type: 'text/html' })))
})
test('receipt validation rejects absent, empty, and oversized files', async () => {
  await assert.rejects(validateReceipt(null))
  await assert.rejects(validateReceipt(new Blob([], { type: 'application/pdf' })))
  await assert.rejects(validateReceipt(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'application/pdf' })))
})

test('joined year is limited to 2010 through 2026', () => {
  assert.equal(normalizeJoinedYear('2010'), 2010)
  assert.equal(normalizeJoinedYear('2026'), 2026)
  for (const value of ['', '2009', '2027', '2010.5']) assert.throws(() => normalizeJoinedYear(value))
})

test('duplicate errors explain the field without exposing another attendee details', () => {
  for (const [index, field] of [['nic', 'NIC'], ['school_index', 'school index'], ['email', 'email']]) {
    const message = friendlyError({code: '23505', message: `duplicate key violates reservations_event_${index}_unique`, details: 'Private attendee data'})
    assert.ok(message.includes(field))
    assert.ok(!message.includes('Private attendee data'))
  }
})
