import { motion, useReducedMotion } from 'motion/react'
import { getPathForAdminTab } from '../../lib/adminNavigation.js'

// Apple/beUI fluid spring curve: snappy start, natural momentum, clean settle
const SPRING_TRANSITION = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.8,
}

export default function AdminBottomNav({ tabs, activeTab, onSelectTab, attentionCount = 0 }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <nav className="admin-bottom-nav" aria-label="Admin navigation">
      <div className="admin-bottom-nav-grid">
        {tabs.map(([key, label, Icon]) => {
          const isActive = activeTab === key
          const showBadge = key === 'updates' && attentionCount > 0

          return (
            <motion.a
              key={key}
              href={getPathForAdminTab(key)}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={`admin-bottom-nav-tab ${isActive ? 'is-active' : ''}`}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.93 }}
              transition={{ duration: 0.1 }}
              onClick={(e) => {
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
                e.preventDefault()
                onSelectTab(key)
              }}
            >
              {/* Fluid Sliding Spring Pill Indicator */}
              {isActive && (
                <motion.div
                  layoutId="admin-bottom-nav-active-pill"
                  className="admin-bottom-nav-pill"
                  transition={shouldReduceMotion ? { duration: 0 } : SPRING_TRANSITION}
                />
              )}

              {/* Tab Contents: Icon + Label */}
              <div className="admin-bottom-nav-tab-body">
                <div className="admin-bottom-nav-icon-box">
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? {}
                        : {
                            scale: isActive ? 1.1 : 1,
                            y: isActive ? -1 : 0,
                          }
                    }
                    transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  >
                    <Icon size={20} className="admin-bottom-nav-icon" />
                  </motion.div>

                  {showBadge && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className="admin-bottom-nav-badge"
                      aria-label={`${attentionCount} notifications`}
                    >
                      {attentionCount > 9 ? '9+' : attentionCount}
                    </motion.span>
                  )}
                </div>

                <span className="admin-bottom-nav-label">
                  {label}
                </span>

                {/* Subtle active pip under label */}
                {isActive && (
                  <motion.span
                    layoutId="admin-bottom-nav-active-pip"
                    className="admin-bottom-nav-pip"
                    transition={shouldReduceMotion ? { duration: 0 } : SPRING_TRANSITION}
                  />
                )}
              </div>
            </motion.a>
          )
        })}
      </div>
    </nav>
  )
}

