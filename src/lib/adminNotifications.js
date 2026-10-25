import { supabase } from '../utils/supabase.js'

const ALERTS_STORAGE_KEY = 'gh_admin_receipt_alerts'

// Pleasant two-tone chime via Web Audio API (zero audio file downloads needed)
export function playReceiptChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const now = ctx.currentTime

    // Note 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(659.25, now)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.02)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // Note 2: A5 (880 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.12)
    gain2.gain.setValueAtTime(0, now + 0.12)
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.14)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.12)
    osc2.stop(now + 0.6)
  } catch (err) {
    console.warn('[Alerts] Could not play audio chime:', err)
  }
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export function isReceiptAlertsEnabled() {
  if (typeof window === 'undefined') return false
  const saved = localStorage.getItem(ALERTS_STORAGE_KEY)
  if (saved !== null) return saved === 'true'
  // Default to enabled if browser notification permission was already granted
  return getNotificationPermission() === 'granted'
}

export function setReceiptAlertsEnabled(enabled) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ALERTS_STORAGE_KEY, enabled ? 'true' : 'false')
  window.dispatchEvent(new CustomEvent('admin:alerts-toggled', { detail: { enabled } }))
}

export async function requestReceiptAlertsPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setReceiptAlertsEnabled(true)
      playReceiptChime()
    }
    return permission
  } catch (err) {
    console.warn('[Alerts] Permission request error:', err)
    return 'denied'
  }
}

const recentAlerts = new Map()

export async function testReceiptNotification() {
  await displayReceiptNotification({
    reservationId: 'test-' + Date.now(),
    fullName: 'Demo Attendee',
    reference: 'GH-TEST',
    amountLkr: 6500,
    isTest: true
  })
}

export async function displayReceiptNotification({ reservationId, fullName, reference, amountLkr, paymentMethod = 'bank_transfer', isTest = false }) {
  if (reservationId && !isTest) {
    const now = Date.now()
    const lastTime = recentAlerts.get(reservationId) || 0
    if (now - lastTime < 10000) return // suppress duplicate alerts within 10s
    recentAlerts.set(reservationId, now)
    for (const [key, time] of recentAlerts.entries()) {
      if (now - time > 60000) recentAlerts.delete(key)
    }
  }

  const title = isTest ? 'Test Alert · Greens Heaven' : paymentMethod === 'cash' ? `New Cash Payment: ${fullName || 'Attendee'}` : `New Receipt: ${fullName || 'Attendee'}`
  const body = `${reference || 'Ticket'} · Rs. ${amountLkr ? Number(amountLkr).toLocaleString() : '6,500'} ${paymentMethod === 'cash' ? 'physical cash recorded for review.' : 'payment submitted for review.'}`
  const url = `/admin/dashboard?review=${reservationId || ''}`

  // Play audio chime if enabled
  if (isReceiptAlertsEnabled()) {
    playReceiptChime()
  }

  // Trigger system / browser notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready
        reg.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `receipt-${reservationId}`,
          renotify: true,
          data: { url, reservationId }
        })
      } else {
        new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          data: { url, reservationId }
        })
      }
    } catch (err) {
      console.warn('[Alerts] Could not trigger system notification:', err)
    }
  }

  // Dispatch custom in-app event for immediate UI refresh and toast notification
  window.dispatchEvent(new CustomEvent('admin:new-receipt', {
    detail: { reservationId, fullName, reference, amountLkr, paymentMethod, isTest }
  }))
  window.dispatchEvent(new CustomEvent('admin:refresh'))
}

export function subscribeToReceiptAlerts(onReceiptReceived) {
  if (!supabase) return () => {}

  const channel = supabase.channel('admin-realtime-receipts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'receipt_submissions' },
      async (payload) => {
        try {
          const resId = payload.new?.reservation_id
          if (!resId) return

          const { data, error } = await supabase
            .from('reservations')
            .select('id, reference, full_name, amount_lkr, status, payment_method')
            .eq('id', resId)
            .maybeSingle()

          if (!error && data) {
            await displayReceiptNotification({
              reservationId: data.id,
              fullName: data.full_name,
              reference: data.reference,
              amountLkr: data.amount_lkr,
              paymentMethod: data.payment_method
            })
            if (onReceiptReceived) onReceiptReceived(data)
          }
        } catch (err) {
          console.warn('[Alerts] Realtime receipt_submissions error:', err)
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'reservations' },
      async (payload) => {
        try {
          const newRow = payload.new
          // Check if status transitioned to pending_review or receipt_path changed
          if (newRow && newRow.status === 'pending_review') {
            await displayReceiptNotification({
              reservationId: newRow.id,
              fullName: newRow.full_name,
              reference: newRow.reference,
              amountLkr: newRow.amount_lkr,
              paymentMethod: newRow.payment_method
            })
            if (onReceiptReceived) onReceiptReceived(newRow)
          }
        } catch (err) {
          console.warn('[Alerts] Realtime reservations update error:', err)
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Alerts] Subscribed to real-time receipt submissions & reservations')
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}
