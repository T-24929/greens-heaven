export const adminSubRoutes = ['overview', 'tickets', 'revenue', 'entrance', 'photobooth', 'updates']

export const adminRoutes = new Set([
  '/admin',
  '/admin/dashboard',
  ...adminSubRoutes.flatMap(sub => [`/admin/dashboard/${sub}`, `/admin/${sub}`]),
])

export function getAdminTabFromPath(path, { hasInitialTicket = false } = {}) {
  const clean = (path || '').replace(/\/$/, '')
  for (const tab of adminSubRoutes) {
    if (clean === `/admin/dashboard/${tab}` || clean === `/admin/${tab}`) {
      return tab
    }
  }
  if (clean === '/admin/dashboard' || clean === '/admin') {
    return hasInitialTicket ? 'tickets' : 'overview'
  }
  return null
}

export function getPathForAdminTab(tab) {
  if (tab === 'overview') return '/admin/dashboard/overview'
  if (adminSubRoutes.includes(tab)) return `/admin/dashboard/${tab}`
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
