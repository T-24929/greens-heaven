import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import {
  getNotificationPermission,
  isReceiptAlertsEnabled,
  playReceiptChime,
  requestReceiptAlertsPermission,
  setReceiptAlertsEnabled
} from '../../lib/adminNotifications.js'
import { useToast } from '../../lib/toasts.js'

export default function AdminReceiptAlertToggle() {
  const toast = useToast()
  const [permission, setPermission] = useState(() => getNotificationPermission())
  const [enabled, setEnabled] = useState(() => isReceiptAlertsEnabled())

  useEffect(() => {
    const handleToggled = (e) => {
      setEnabled(e.detail?.enabled ?? isReceiptAlertsEnabled())
    }
    window.addEventListener('admin:alerts-toggled', handleToggled)
    return () => window.removeEventListener('admin:alerts-toggled', handleToggled)
  }, [])

  const handleToggle = async () => {
    const currentPerm = getNotificationPermission()
    if (currentPerm === 'unsupported') {
      toast.show({ status: 'warning', title: 'System notifications not supported in this browser' })
      return
    }

    if (currentPerm === 'denied') {
      toast.show({
        status: 'error',
        title: 'Notifications are blocked',
        description: 'Allow notifications in your browser settings to receive real-time receipt alerts.'
      })
      return
    }

    if (currentPerm !== 'granted') {
      const result = await requestReceiptAlertsPermission()
      setPermission(result)
      if (result === 'granted') {
        setEnabled(true)
        toast.show({ status: 'success', title: 'Real-time receipt alerts activated', description: 'You will receive sound and desktop notifications when receipts are uploaded.' })
      } else {
        toast.show({ status: 'warning', title: 'Notification permission was not granted' })
      }
      return
    }

    // Permission is already granted, toggle on/off
    const nextState = !enabled
    setReceiptAlertsEnabled(nextState)
    setEnabled(nextState)
    if (nextState) {
      playReceiptChime()
      toast.show({ status: 'success', title: 'Receipt alerts turned ON' })
    } else {
      toast.show({ status: 'info', title: 'Receipt alerts silenced' })
    }
  }

  const isBlocked = permission === 'denied'
  const isActive = enabled && permission === 'granted'

  return (
    <button
      type="button"
      className={`admin-header-btn admin-header-icon-btn admin-header-alerts-btn ${isActive ? 'active' : ''} ${isBlocked ? 'blocked' : ''}`}
      onClick={handleToggle}
      aria-label={isActive ? 'Disable receipt alerts' : 'Enable receipt alerts'}
      title={
        isBlocked
          ? 'Notifications blocked in browser settings'
          : isActive
          ? 'Receipt alerts active (Click to silence)'
          : 'Enable sound and desktop alerts for new receipts'
      }
    >
      {isActive ? (
        <BellRing size={16} />
      ) : isBlocked ? (
        <BellOff size={16} />
      ) : (
        <Bell size={16} />
      )}
      {isActive && <span className="admin-alert-active-dot" aria-hidden="true" />}
    </button>
  )
}
