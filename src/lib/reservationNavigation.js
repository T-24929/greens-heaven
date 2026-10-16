import { flushSync } from 'react-dom'

export const reservationRoutes = new Set(['/reserve', '/ticket', '/payment', '/dashboard'])

export function navigateReservation(path, { replace = false } = {}) {
  if (path === window.location.pathname) return
  history[replace ? 'replaceState' : 'pushState'](null, '', path)
  flushSync(() => window.dispatchEvent(new PopStateEvent('popstate')))
  window.scrollTo({ top: 0, behavior: 'instant' })
  const main = document.getElementById('main')
  main?.focus({ preventScroll: true })
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    main?.animate([
      { opacity: .4, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' })
  }
}
