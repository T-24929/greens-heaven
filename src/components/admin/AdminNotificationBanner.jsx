import { useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import {
  getNotificationPermission,
  isReceiptAlertsEnabled,
  requestReceiptAlertsPermission
} from '../../lib/adminNotifications.js'
import { useToast } from '../../lib/toasts.js'

export default function AdminNotificationBanner() {
  const toast = useToast()
  const [permission, setPermission] = useState(() => getNotificationPermission())
  const [enabled, setEnabled] = useState(() => isReceiptAlertsEnabled())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handleToggled = (e) => {
      setEnabled(e.detail?.enabled ?? isReceiptAlertsEnabled())
      setPermission(getNotificationPermission())
    }
    window.addEventListener('admin:alerts-toggled', handleToggled)
    return () => window.removeEventListener('admin:alerts-toggled', handleToggled)
  }, [])

  if (dismissed) return null
  if (permission === 'unsupported') return null

  const handleAllow = async () => {
    const res = await requestReceiptAlertsPermission()
    setPermission(res)
    if (res === 'granted') {
      setEnabled(true)
      toast.show({
        status: 'success',
        title: 'Receipt notifications active!',
        description: 'You will receive desktop and sound alerts whenever an attendee uploads a receipt.'
      })
    } else if (res === 'denied') {
      toast.show({
        status: 'error',
        title: 'Notifications were blocked',
        description: 'You can unblock notifications from your browser address bar settings.'
      })
    }
  }

  // State 1: Permission not yet requested or default
  if (permission === 'default' || !enabled) {
    return (
      <section className="admin-allow-notifications-banner" aria-label="Notification setup">
        <div className="admin-banner-icon-col">
          <div className="admin-banner-bell-badge">
            <Bell size={20} className="admin-banner-bell-pulse" />
          </div>
        </div>
        <div className="admin-banner-content">
          <h3 className="admin-banner-title">Allow Receipt Notifications?</h3>
          <p className="admin-banner-desc">
            Get instant sound and desktop alerts the second an attendee uploads proof of payment, so you never miss a review.
          </p>
          <div className="admin-banner-actions">
            <button
              type="button"
              className="admin-button primary admin-banner-allow-btn"
              onClick={handleAllow}
            >
              <Bell size={15} />
              <span>Allow Notifications</span>
            </button>
            <button
              type="button"
              className="admin-banner-dismiss-link"
              onClick={() => setDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          className="admin-banner-close-btn"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
        >
          <X size={16} />
        </button>
      </section>
    )
  }

  // State 2: Blocked by browser settings
  if (permission === 'denied') {
    return (
      <div className="admin-blocked-notifications-banner" role="alert">
        <BellOff size={18} className="text-[#f43f5e] shrink-0" />
        <div className="flex-1 text-xs text-[#f0c2b5]">
          <strong>Notifications blocked in browser:</strong> Click the tune / padlock icon in your browser URL bar and set Notifications to <em>Allow</em> to receive real-time receipt alerts.
        </div>
        <button
          type="button"
          className="admin-banner-close-btn"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss message"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  // State 3: Granted & Active — Banner removed per user request
  return null
}
