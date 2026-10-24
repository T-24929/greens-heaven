export const adminSubRoutes = ['overview', 'tickets', 'revenue', 'attendance', 'arrivals', 'updates']

export const adminGateRoutes = ['entrance', 'photobooth']

const gateRoutePaths = adminGateRoutes.flatMap(gate => [
  `/admin/dashboard/attendance/${gate}`,
  `/admin/attendance/${gate}`,
  // Keep the previous gate URLs working for saved bookmarks and older QR links.
  `/admin/dashboard/${gate}`,
  `/admin/${gate}`,
])

export const adminRoutes = new Set([
  '/admin',
  '/admin/dashboard',
  ...adminSubRoutes.flatMap(sub => [`/admin/dashboard/${sub}`, `/admin/${sub}`]),
  ...gateRoutePaths,
])

export function getAdminGateFromPath(path) {
  const clean = (path || '').replace(/\/$/, '')
  for (const gate of adminGateRoutes) {
    if (gateRoutePaths.includes(clean) && (
      clean.endsWith(`/attendance/${gate}`) ||
      clean.endsWith(`/${gate}`)
    )) return gate
  }
  return null
}

export function getAdminTabFromPath(path, { hasInitialTicket = false } = {}) {
  const clean = (path || '').replace(/\/$/, '')
  for (const tab of adminSubRoutes) {
    if (clean === `/admin/dashboard/${tab}` || clean === `/admin/${tab}`) {
      return tab
    }
  }
  if (getAdminGateFromPath(clean)) return 'attendance'
  if (clean === '/admin/dashboard' || clean === '/admin') {
    return hasInitialTicket ? 'tickets' : 'overview'
  }
  return null
}

export function getPathForAdminTab(tab) {
  if (tab === 'overview') return '/admin/dashboard/overview'
  if (adminSubRoutes.includes(tab)) return `/admin/dashboard/${tab}`
  if (adminGateRoutes.includes(tab)) return `/admin/dashboard/attendance/${tab}`
  return '/admin/dashboard'
}

export function navigateAdmin(tabOrPath, { replace = false } = {}) {
  if (typeof window === 'undefined' || typeof history === 'undefined') return
  const targetPath = (tabOrPath && tabOrPath.startsWith('/'))
    ? tabOrPath
    : getPathForAdminTab(tabOrPath)
  if (targetPath === window.location.pathname) return
  history[replace ? 'replaceState' : 'pushState'](null, '', targetPath)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
  const main = document.getElementById('main')
  main?.focus({ preventScroll: true })
}
