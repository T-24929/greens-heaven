import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { MoreHorizontal } from 'lucide-react'
import { getPathForAdminTab } from '../../lib/adminNavigation.js'

// A short, interruptible spring gives the active circle a fluid handoff.
const NAV_SPRING = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.72,
}

const SECONDARY_KEYS = new Set(['arrivals', 'updates'])

export default function AdminBottomNav({ tabs, activeTab, onSelectTab, attentionCount = 0 }) {
  const shouldReduceMotion = useReducedMotion()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const menuRef = useRef(null)

  const primaryTabs = tabs.filter(([key]) => !SECONDARY_KEYS.has(key))
  const secondaryTabs = tabs.filter(([key]) => SECONDARY_KEYS.has(key))

  const isSecondaryActive = SECONDARY_KEYS.has(activeTab)
  const activeSecondaryItem = secondaryTabs.find(([k]) => k === activeTab)
  const MoreIcon = activeSecondaryItem ? activeSecondaryItem[2] : MoreHorizontal

  const hasSecondaryAttention = Boolean(
    secondaryTabs.some(([k]) => k === 'updates') && attentionCount > 0 && activeTab !== 'updates'
  )

  useEffect(() => {
    if (!isMoreOpen) return

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMoreOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMoreOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreOpen])

  return (
    <nav className="admin-bottom-nav" aria-label="Admin navigation">
      {/* Floating Action Menu / FAB Popover for Secondary Options */}
      <AnimatePresence>
        {isMoreOpen && secondaryTabs.length > 0 && (
          <motion.div
            ref={menuRef}
            className="admin-bottom-nav-fab-popover"
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.94 }}
            transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
            role="menu"
            aria-label="More navigation options"
          >
            <div className="admin-bottom-nav-fab-header">
              <span className="admin-bottom-nav-fab-heading">Quick Actions</span>
            </div>

            <div className="admin-bottom-nav-fab-list">
              {secondaryTabs.map(([key, label, Icon]) => {
                const isSecActive = activeTab === key
                const showBadge = key === 'updates' && attentionCount > 0

                return (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    className={`admin-bottom-nav-fab-btn ${isSecActive ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsMoreOpen(false)
                      onSelectTab(key)
                    }}
                  >
                    <div className="admin-bottom-nav-fab-icon-wrap">
                      <Icon size={18} className="admin-bottom-nav-fab-icon" />
                      {showBadge && (
                        <span className="admin-bottom-nav-fab-badge" aria-hidden="true">
                          {attentionCount > 9 ? '9+' : attentionCount}
                        </span>
                      )}
                    </div>
                    <div className="admin-bottom-nav-fab-content">
                      <strong className="admin-bottom-nav-fab-title">{label}</strong>
                      <span className="admin-bottom-nav-fab-desc">
                        {key === 'arrivals'
                          ? 'Live check-in stream'
                          : attentionCount > 0
                          ? `${attentionCount} unsent delivery alerts`
                          : 'Delivery logs & outbox'}
                      </span>
                    </div>
                    {isSecActive && (
                      <span className="admin-bottom-nav-fab-active-dot" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="admin-bottom-nav-capsule">
        <LayoutGroup id="admin-bottom-nav">
          {/* Primary Tabs */}
          {primaryTabs.map(([key, label, Icon]) => {
            const isActive = activeTab === key

            return (
              <motion.a
                key={key}
                href={getPathForAdminTab(key)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                title={label}
                className={`admin-bottom-nav-dot-btn ${isActive ? 'is-active' : ''}`}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  setIsMoreOpen(false)
                  onSelectTab(key)
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-bubble"
                    initial={false}
                    className="admin-bottom-nav-active-bubble"
                    transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
                  />
                )}

                <div className="admin-bottom-nav-dot-inner">
                  <Icon size={18} className="admin-bottom-nav-dot-icon" />
                </div>
              </motion.a>
            )
          })}

          {/* Secondary Tabs (Desktop-only direct tabs) */}
          {secondaryTabs.map(([key, label, Icon]) => {
            const isActive = activeTab === key
            const showBadge = key === 'updates' && attentionCount > 0

            return (
              <motion.a
                key={key}
                href={getPathForAdminTab(key)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                title={label}
                className={`admin-bottom-nav-dot-btn admin-nav-desktop-only ${isActive ? 'is-active' : ''}`}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
                transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                  e.preventDefault()
                  setIsMoreOpen(false)
                  onSelectTab(key)
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-bubble"
                    initial={false}
                    className="admin-bottom-nav-active-bubble"
                    transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
                  />
                )}

                <div className="admin-bottom-nav-dot-inner">
                  <Icon size={18} className="admin-bottom-nav-dot-icon" />
                  {showBadge && (
                    <span className="admin-bottom-nav-dot-badge" aria-hidden="true" />
                  )}
                </div>
              </motion.a>
            )
          })}

          {/* More Options Button (Mobile-only FAB toggle) */}
          {secondaryTabs.length > 0 && (
            <motion.button
              type="button"
              aria-label={activeSecondaryItem ? `${activeSecondaryItem[1]} (More options)` : 'More options'}
              aria-expanded={isMoreOpen}
              aria-haspopup="menu"
              title={activeSecondaryItem ? activeSecondaryItem[1] : 'More actions'}
              className={`admin-bottom-nav-dot-btn admin-nav-mobile-only ${isSecondaryActive || isMoreOpen ? 'is-active' : ''}`}
              whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
              transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
              onClick={(e) => {
                e.preventDefault()
                setIsMoreOpen((prev) => !prev)
              }}
            >
              {isSecondaryActive && (
                <motion.div
                  layoutId="active-bubble"
                  initial={false}
                  className="admin-bottom-nav-active-bubble"
                  transition={shouldReduceMotion ? { duration: 0 } : NAV_SPRING}
                />
              )}

              <div className="admin-bottom-nav-dot-inner">
                <MoreIcon size={18} className="admin-bottom-nav-dot-icon" />
                {hasSecondaryAttention && (
                  <span className="admin-bottom-nav-dot-badge" aria-hidden="true" />
                )}
              </div>
            </motion.button>
          )}
        </LayoutGroup>
      </div>
    </nav>
  )
}
