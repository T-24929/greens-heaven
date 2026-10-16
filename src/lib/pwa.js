let deferredPrompt = null
const listeners = new Set()

export function isStandalone() {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone ||
    document.referrer.includes('android-app://')
  )
}

export function isIos() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream
}

export function canInstallPwa() {
  return Boolean(deferredPrompt)
}

export function subscribePwaInstall(callback) {
  listeners.add(callback)
  callback({ canInstall: Boolean(deferredPrompt), isInstalled: isStandalone() })
  return () => listeners.delete(callback)
}

function notifyListeners() {
  const state = { canInstall: Boolean(deferredPrompt), isInstalled: isStandalone() }
  for (const listener of listeners) {
    listener(state)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notifyListeners()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notifyListeners()
  })
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return null
  try {
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    deferredPrompt = null
    notifyListeners()
    return choice.outcome
  } catch (err) {
    console.warn('[PWA] Install prompt failed:', err)
    return null
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Check for updates periodically
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New version ready')
            }
          })
        })
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration error:', err)
      })
  })
}
