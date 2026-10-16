import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdminMap, getAdminDisplayName, formatDisplayNameFromEmail, getInitials } from './admins.js'

test('formatDisplayNameFromEmail formats recognizable human names from emails', () => {
  assert.equal(formatDisplayNameFromEmail('hasarinda986@gmail.com'), 'Hasarinda')
  assert.equal(formatDisplayNameFromEmail('abdulfaruk200721@gmail.com'), 'Abdul Faruk')
  assert.equal(formatDisplayNameFromEmail('aneeqahamed65@gmail.com'), 'Aneeq Ahamed')
  assert.equal(formatDisplayNameFromEmail('nethmithakariyawasam@gmail.com'), 'Nethmitha Kariyawasam')
  assert.equal(formatDisplayNameFromEmail('sasinduranasinghe121@gmail.com'), 'Sasindu Ranasinghe')
  assert.equal(formatDisplayNameFromEmail('john.doe@example.com'), 'John Doe')
  assert.equal(formatDisplayNameFromEmail(''), 'Admin')
  assert.equal(formatDisplayNameFromEmail(null), 'Admin')
})

test('getInitials creates clean 2-letter uppercase initials', () => {
  assert.equal(getInitials('Abdul Faruk'), 'AF')
  assert.equal(getInitials('Aneeq Ahamed'), 'AA')
  assert.equal(getInitials('Hasarinda'), 'HA')
  assert.equal(getInitials('Nethmitha Kariyawasam'), 'NK')
  assert.equal(getInitials('Sasindu Ranasinghe'), 'SR')
  assert.equal(getInitials(''), 'AD')
  assert.equal(getInitials(null), 'AD')
})

test('buildAdminMap prefers full_name over email when available', () => {
  const admins = [
    { user_id: '270cfdce-18f7-4084-b1f9-ee6327b10c52', email: 'abdulfaruk200721@gmail.com', full_name: 'Abdul Faruk' },
    { id: 'c5715f2f-5b88-4b6b-b50d-2b338b90bec4', email: 'aneeqahamed65@gmail.com' },
  ]
  const map = buildAdminMap(admins)
  assert.equal(map['270cfdce-18f7-4084-b1f9-ee6327b10c52'], 'Abdul Faruk')
  assert.equal(map['c5715f2f-5b88-4b6b-b50d-2b338b90bec4'], 'aneeqahamed65@gmail.com')
})

test('buildAdminMap indexes both user_id and id to admin email', () => {
  const admins = [
    { user_id: '270cfdce-18f7-4084-b1f9-ee6327b10c52', email: 'abdulfaruk200721@gmail.com', role: 'admin' },
    { id: 'c5715f2f-5b88-4b6b-b50d-2b338b90bec4', email: 'aneeqahamed65@gmail.com', role: 'admin' },
    { user_id: 'cd968dcb-110e-46a6-9bf8-0b320d356e2c', id: 'cd968dcb-110e-46a6-9bf8-0b320d356e2c', email: 'nethmithakariyawasam@gmail.com', role: 'admin' },
  ]

  const map = buildAdminMap(admins)
  assert.equal(map['270cfdce-18f7-4084-b1f9-ee6327b10c52'], 'abdulfaruk200721@gmail.com')
  assert.equal(map['c5715f2f-5b88-4b6b-b50d-2b338b90bec4'], 'aneeqahamed65@gmail.com')
  assert.equal(map['cd968dcb-110e-46a6-9bf8-0b320d356e2c'], 'nethmithakariyawasam@gmail.com')
})

test('buildAdminMap handles empty or malformed input safely', () => {
  assert.deepEqual(buildAdminMap([]), {})
  assert.deepEqual(buildAdminMap(null), {})
  assert.deepEqual(buildAdminMap(undefined), {})
})

test('getAdminDisplayName resolves email when UUID is known or falls back to short UID', () => {
  const map = {
    '270cfdce-18f7-4084-b1f9-ee6327b10c52': 'abdulfaruk200721@gmail.com'
  }

  assert.equal(getAdminDisplayName(null, map), null)
  assert.equal(getAdminDisplayName('', map), null)
  assert.equal(getAdminDisplayName('270cfdce-18f7-4084-b1f9-ee6327b10c52', map), 'abdulfaruk200721@gmail.com')
  assert.equal(getAdminDisplayName('93419dcd-1e83-4345-8191-3dcd061d2128', map), 'Admin (93419dcd…)')
})


