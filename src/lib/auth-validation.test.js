import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAuthField as validate } from './auth-validation.js'

test('email accepts surrounding whitespace and plus addresses, rejects malformed input', () => {
  assert.equal(validate('email', '  batch+ticket@example.lk  ', 'login'), '')
  for (const input of ['', '  ', 'batch', 'name@@example.lk', 'name @example.lk', 'name@example']) {
    assert.notEqual(validate('email', input, 'login'), '')
  }
})
test('existing passwords can sign in without applying new-password minimum length', () => {
  assert.equal(validate('password', 'old', 'login'), '')
  assert.notEqual(validate('password', '', 'login'), '')
  for (const mode of ['signup', 'update']) {
    assert.notEqual(validate('password', 'short', mode), '')
    assert.equal(validate('password', 'sixsix', mode), '')
    assert.equal(validate('password', 'a long passphrase', mode), '')
    assert.notEqual(validate('password', 'a'.repeat(129), mode), '')
  }
})
test('confirmation matches exactly, including spaces and case', () => {
  assert.equal(validate('confirm', ' My passphrase ', 'signup', ' My passphrase '), '')
  assert.notEqual(validate('confirm', 'My passphrase', 'signup', ' My passphrase '), '')
  assert.notEqual(validate('confirm', 'my passphrase', 'update', 'My passphrase'), '')
  assert.notEqual(validate('confirm', '', 'update', 'My passphrase'), '')
})
