import { useEffect, useId } from 'react'
import { useToast } from '../lib/toasts.js'

export function Notice({ children, kind = 'info' }) {
  const toast = useToast()
  const id = useId()
  const floating = (kind === 'error' || kind === 'success') && typeof children === 'string'
  useEffect(() => {
    if (floating && children) toast.show({ id, status: kind, title: children })
    return () => toast.dismiss(id)
  }, [children, floating, id, kind, toast])
  if (!children || floating) return null
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Loading({ children = 'Loading your details…' }) {
  return <div className="panel stack" role="status" aria-live="polite"><div className="skeleton" /><p className="muted">{children}</p></div>
}

export function SetupNotice() {
  return <Notice>Online reservations are being set up. Please check back soon.</Notice>
}
