import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adminRoutes,
  adminSubRoutes,
  getAdminTabFromPath,
  getPathForAdminTab,
} from './adminNavigation.js'

test('adminRoutes contains all dashboard sub-paths and short aliases', () => {
  assert.deepEqual(adminSubRoutes, ['overview', 'tickets', 'entrance', 'photobooth', 'updates'])
  const expected = [
    '/admin',
    '/admin/dashboard',
    '/admin/dashboard/overview',
    '/admin/dashboard/tickets',
    '/admin/dashboard/entrance',
    '/admin/dashboard/photobooth',
    '/admin/dashboard/updates',
    '/admin/overview',
    '/admin/tickets',
    '/admin/entrance',
    '/admin/photobooth',
    '/admin/updates',
  ]
  for (const path of expected) {
    assert.equal(adminRoutes.has(path), true, `Expected adminRoutes to have ${path}`)
  }
  assert.equal(adminRoutes.has('/admin/dashboard/unknown'), false)
  assert.equal(adminRoutes.has('/dashboard'), false)
})

test('getAdminTabFromPath identifies the correct admin tab', () => {
  assert.equal(getAdminTabFromPath('/admin/dashboard'), 'overview')
  assert.equal(getAdminTabFromPath('/admin/dashboard/'), 'overview')
  assert.equal(getAdminTabFromPath('/admin/dashboard', { hasInitialTicket: true }), 'tickets')
  assert.equal(getAdminTabFromPath('/admin/dashboard/overview'), 'overview')
  assert.equal(getAdminTabFromPath('/admin/dashboard/tickets'), 'tickets')
  assert.equal(getAdminTabFromPath('/admin/dashboard/entrance'), 'entrance')
  assert.equal(getAdminTabFromPath('/admin/dashboard/photobooth'), 'photobooth')
  assert.equal(getAdminTabFromPath('/admin/dashboard/updates'), 'updates')
  assert.equal(getAdminTabFromPath('/admin/entrance/'), 'entrance')
  assert.equal(getAdminTabFromPath('/admin/photobooth'), 'photobooth')
  assert.equal(getAdminTabFromPath('/admin'), 'overview')
  assert.equal(getAdminTabFromPath('/admin', { hasInitialTicket: true }), 'tickets')

  // Non-admin routes should return null
  assert.equal(getAdminTabFromPath('/'), null)
  assert.equal(getAdminTabFromPath('/dashboard'), null)
  assert.equal(getAdminTabFromPath('/reserve'), null)
  assert.equal(getAdminTabFromPath('/admin/dashboard/invalid'), null)
})

test('getPathForAdminTab returns the sub-path for each bottom nav tab', () => {
  assert.equal(getPathForAdminTab('overview'), '/admin/dashboard/overview')
  assert.equal(getPathForAdminTab('tickets'), '/admin/dashboard/tickets')
  assert.equal(getPathForAdminTab('entrance'), '/admin/dashboard/entrance')
  assert.equal(getPathForAdminTab('photobooth'), '/admin/dashboard/photobooth')
  assert.equal(getPathForAdminTab('updates'), '/admin/dashboard/updates')
  assert.equal(getPathForAdminTab('unknown'), '/admin/dashboard')
})
