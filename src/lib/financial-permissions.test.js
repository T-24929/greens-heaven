import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isSuperAdmin,
  isFinancialViewOnly,
  canAccessFinancialTab,
  canManageFinancials,
  SUPER_ADMINS,
  FINANCIAL_VIEW_ONLY_ADMINS,
} from './permissions.js'

test('FINANCIAL_VIEW_ONLY_ADMINS contains designated view-only admin email', () => {
  assert.ok(FINANCIAL_VIEW_ONLY_ADMINS.includes('nethmithakariyawasam@gmail.com'))
})

test('nethmithakariyawasam@gmail.com is restricted to view-only for financial tab', () => {
  const email = 'nethmithakariyawasam@gmail.com'
  assert.equal(isSuperAdmin(email), false)
  assert.equal(isFinancialViewOnly(email), true)
  assert.equal(canAccessFinancialTab(email), true)
  assert.equal(canManageFinancials(email), false)
})

test('financial permission checks normalize casing and whitespace', () => {
  assert.equal(isFinancialViewOnly('  NETHMITHAKARIYAWASAM@GMAIL.COM  '), true)
  assert.equal(canAccessFinancialTab('  NethmithaKariyawasam@gmail.com '), true)
  assert.equal(canManageFinancials('  NethmithaKariyawasam@gmail.com '), false)
})

test('super admins retain full management access to financial tab', () => {
  for (const admin of SUPER_ADMINS) {
    assert.equal(isSuperAdmin(admin), true)
    assert.equal(isFinancialViewOnly(admin), false)
    assert.equal(canAccessFinancialTab(admin), true)
    assert.equal(canManageFinancials(admin), true)
  }
})

test('regular admins without financial permissions have no financial tab access', () => {
  const regularAdmins = ['abdulfaruk200721@gmail.com', 'aneeqahamed65@gmail.com', 'random@example.com']
  for (const admin of regularAdmins) {
    assert.equal(isSuperAdmin(admin), false)
    assert.equal(isFinancialViewOnly(admin), false)
    assert.equal(canAccessFinancialTab(admin), false)
    assert.equal(canManageFinancials(admin), false)
  }
})

test('handles null, undefined, or empty email input gracefully', () => {
  const empties = [null, undefined, '', '   ']
  for (const empty of empties) {
    assert.equal(isSuperAdmin(empty), false)
    assert.equal(isFinancialViewOnly(empty), false)
    assert.equal(canAccessFinancialTab(empty), false)
    assert.equal(canManageFinancials(empty), false)
  }
})
