import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { isIos, promptPwaInstall, subscribePwaInstall } from '../lib/pwa.js'

export default function InstallAppButton({ className = '', variant = 'admin', onAction }) {
  const [state, setState] = useState({ canInstall: false, isInstalled: false })
  const [showIosGuide, setShowIosGuide] = useState(false)
  const isApple = isIos()

  useEffect(() => {
    return subscribePwaInstall(setState)
  }, [])

  // If already installed as PWA standalone, no install button needed
  if (state.isInstalled) return null

  // If not installable and not iOS, do not show button
  if (!state.canInstall && !isApple) return null

  const handleClick = async () => {
    if (state.canInstall) {
      onAction?.()
      await promptPwaInstall()
    } else if (isApple) {
      setShowIosGuide(true)
    }
  }

  const handleCloseGuide = () => {
    setShowIosGuide(false)
    onAction?.()
  }

  const isMenuItem = variant === 'menu-item'

  return (
    <>
      <button
        type="button"
        className={
          className ||
          (isMenuItem
            ? 'admin-island-menu-item'
            : variant === 'admin'
            ? 'admin-header-btn admin-header-install-btn'
            : 'button-link')
        }
        onClick={handleClick}
        title="Install Greens Heaven Admin app on your device"
        aria-label="Install admin app"
        role={isMenuItem ? 'menuitem' : undefined}
      >
        {isMenuItem ? (
          <>
            <span className="admin-island-item-icon" aria-hidden="true">
              <Download size={15} />
            </span>
            <div className="admin-island-item-content">
              <span className="admin-island-item-title">Install App</span>
              <span className="admin-island-item-desc">Add to home screen for offline & alerts</span>
            </div>
          </>
        ) : (
          <>
            <Download size={14} />
            <span>Install App</span>
          </>
        )}
      </button>

      {showIosGuide && (
        <div className="pwa-ios-modal-backdrop" onClick={handleCloseGuide}>
          <div className="pwa-ios-modal" onClick={e => e.stopPropagation()}>
            <div className="pwa-ios-modal-header">
              <h3>Install Greens Heaven Admin on iOS</h3>
              <button
                type="button"
                className="pwa-ios-close-btn"
                onClick={handleCloseGuide}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="pwa-ios-text">
              To install the admin workspace on your iPhone or iPad:
            </p>
            <ol className="pwa-ios-steps">
              <li>
                Tap the <strong>Share</strong> button <Share size={15} className="inline-icon" /> in Safari’s navigation bar.
              </li>
              <li>
                Scroll down and select <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner.
              </li>
            </ol>
            <p className="pwa-ios-note">
              This enables standalone fullscreen organizer mode and real-time receipt notification alerts on iOS.
            </p>
            <button
              type="button"
              className="admin-button primary w-full text-center"
              onClick={handleCloseGuide}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
