import { useEffect, useRef, useState } from 'react'
import { LogOut, MoreHorizontal, RefreshCw, Shield } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import InstallAppButton from '../InstallAppButton.jsx'
import AdminReceiptAlertToggle from './AdminReceiptAlertToggle.jsx'

export default function AdminHeader({
  user,
  onSignOut,
  signingOut = false,
  adminRefreshing = false,
  onTriggerRefresh,
  onOpenAdmins,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleAction = (callback) => {
    setIsOpen(false)
    callback?.()
  }

  return (
    <header className="admin-island-header-wrapper" role="banner">
      <div className="admin-island-container">
        {/* Brand Logo Island Capsule */}
        <a
          href="/"
          className="admin-island-brand"
          aria-label="Greens Heaven home"
        >
          <img
            src="/images/greens-heaven-logo.png"
            alt="Greens Heaven"
            width="425"
            height="179"
            className="admin-island-logo"
          />
          <span className="admin-island-badge">Admin</span>
        </a>

        {/* Action Controls Island Capsule */}
        <div className="admin-island-actions">
            <AdminReceiptAlertToggle />

            <div className="admin-island-menu-anchor" ref={menuRef}>
              <motion.button
                type="button"
                className={`admin-island-btn admin-island-dots-btn ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label="Admin settings and actions menu"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                title="Admin actions menu"
                whileTap={{ scale: 0.92 }}
              >
                <MoreHorizontal size={18} />
              </motion.button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    className="admin-island-popover"
                    initial={{ opacity: 0, scale: 0.92, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -6 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    role="menu"
                    aria-label="Admin options menu"
                  >
                    {/* Admin identity card */}
                    {user && (
                      <div className="admin-island-popover-header">
                        <div className="admin-island-avatar" aria-hidden="true">
                          <Shield size={14} />
                        </div>
                        <div className="admin-island-user-details">
                          <span
                            className="admin-island-user-email"
                            title={user.email || 'Administrator'}
                          >
                            {user.email || 'Administrator'}
                          </span>
                          <div className="admin-island-user-status">
                            <span
                              className="admin-island-status-pip"
                              aria-hidden="true"
                            />
                            <span>Administrator</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="admin-island-divider" />

                    {/* Quick Admin Actions */}
                    <div className="admin-island-menu-list">
                      <button
                        type="button"
                        className="admin-island-menu-item"
                        onClick={() => handleAction(onTriggerRefresh)}
                        disabled={adminRefreshing}
                        role="menuitem"
                      >
                        <span className="admin-island-item-icon" aria-hidden="true">
                          <RefreshCw
                            size={15}
                            className={adminRefreshing ? 'admin-spin' : ''}
                          />
                        </span>
                        <div className="admin-island-item-content">
                          <span className="admin-island-item-title">
                            {adminRefreshing ? 'Refreshing…' : 'Refresh data'}
                          </span>
                          <span className="admin-island-item-desc">
                            Reload latest tickets & stats
                          </span>
                        </div>
                      </button>

                      <InstallAppButton
                        variant="menu-item"
                        onAction={() => setIsOpen(false)}
                      />

                      <button
                        type="button"
                        className="admin-island-menu-item"
                        onClick={() => handleAction(onOpenAdmins)}
                        role="menuitem"
                      >
                        <span className="admin-island-item-icon" aria-hidden="true">
                          <Shield size={15} />
                        </span>
                        <div className="admin-island-item-content">
                          <span className="admin-island-item-title">
                            System Admins
                          </span>
                          <span className="admin-island-item-desc">
                            View and manage administrators
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Session / Sign Out */}
                    {user && (
                      <>
                        <div className="admin-island-divider" />
                        <div className="admin-island-menu-list">
                          <button
                            type="button"
                            className="admin-island-menu-item admin-island-menu-item-destructive"
                            onClick={() => handleAction(onSignOut)}
                            disabled={signingOut}
                            role="menuitem"
                          >
                            <span className="admin-island-item-icon" aria-hidden="true">
                              <LogOut size={15} />
                            </span>
                            <div className="admin-island-item-content">
                              <span className="admin-island-item-title">
                                {signingOut ? 'Signing out…' : 'Sign out'}
                              </span>
                              <span className="admin-island-item-desc">
                                End your active admin session
                              </span>
                            </div>
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>
  )
}

