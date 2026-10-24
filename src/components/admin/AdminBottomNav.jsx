import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { getPathForAdminTab } from '../../lib/adminNavigation.js'

// A short, interruptible spring gives the active circle a fluid handoff.
const NAV_SPRING = {
  type: 'spring',
  stiffness: 520,
  damping: 34,
  mass: 0.72,
}

export default function AdminBottomNav({ tabs, activeTab, onSelectTab, attentionCount = 0 }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <nav className="admin-bottom-nav" aria-label="Admin navigation">
      <div className="admin-bottom-nav-capsule">
        <LayoutGroup id="admin-bottom-nav">
        {tabs.map(([key, label, Icon]) => {
          const isActive = activeTab === key
          const showBadge = key === 'updates' && attentionCount > 0

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
                onSelectTab(key)
              }}
            >
              {/* Fluid Sliding Spring Pill for Active Dot */}
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
        </LayoutGroup>
      </div>
    </nav>
  )
}

