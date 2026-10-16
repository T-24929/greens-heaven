import { useEffect, useState } from 'react'
import {
  Shield,
  X,
  RefreshCw,
} from 'lucide-react'
import { getAdminsList, formatDisplayNameFromEmail, getInitials } from '../../lib/admins.js'
import { MorphingModal } from '../motion/morphing-modal.jsx'
import { Loader } from '../motion/loader.jsx'

export default function AdminsDrawer({ currentUser, open, onClose }) {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAdmins() {
    setLoading(true)
    setError('')
    try {
      const data = await getAdminsList(true)
      setAdmins(data || [])
    } catch (err) {
      setError(err?.message || 'Could not load administrators list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let active = true
    getAdminsList().then((data) => {
      if (!active) return
      setAdmins(data || [])
      setLoading(false)
    }).catch(err => {
      if (active) {
        setError(err?.message || 'Could not load administrators list.')
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [open])

  return (
    <MorphingModal
      viewId={open ? 'admins-directory' : null}
      titleId="admins-directory-heading"
      className="scrollbar-none"
      onClose={onClose}
    >
      <div className="admin-detail-dialog ">
        <div className="admin-drawer-container">
          {/* Header */}
          <div className="admin-drawer-header">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#14281a] border border-[#264b2d] flex items-center justify-center text-[#7ce698] flex-shrink-0">
                <Shield size={16} />
              </div>
              <div>
                <h2 id="admins-directory-heading" className="admin-drawer-title">
                  Admins
                </h2>
                <span className="text-[11px] text-[#7f997a]">
                  {admins.length} authorized {admins.length === 1 ? 'account' : 'accounts'}
                </span>
              </div>
            </div>
            <div className="admin-drawer-header-actions">
              <button
                type="button"
                className="admin-dialog-icon-btn min-w-[36px] min-h-[36px] flex items-center justify-center touch-manipulation select-none active:scale-[0.95]"
                onClick={loadAdmins}
                disabled={loading}
                title="Refresh administrators list"
                aria-label="Refresh administrators"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                className="admin-drawer-close-btn min-w-[36px] min-h-[36px] flex items-center justify-center touch-manipulation select-none active:scale-[0.95]"
                onClick={onClose}
                title="Close"
                aria-label="Close administrators directory"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {error && <p className="notice notice-error" role="alert">{error}</p>}

          {/* Admins List */}
          {loading ? (
            <div className="admin-empty">
              <Loader label="Loading administrators…" />
            </div>
          ) : admins.length === 0 ? (
            <p className="admin-empty">No administrator records found.</p>
          ) : (
            <div className="space-y-2">
              {admins.map((adm) => {
                const uid = adm.user_id || adm.id
                const isCurrent = currentUser?.id === uid
                const displayName = adm.full_name || formatDisplayNameFromEmail(adm.email)
                const initials = adm.initials || getInitials(displayName)

                return (
                  <div
                    key={uid}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#08150c] border border-[#1b3422] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full bg-[#122b19] border border-[#234c2d] text-[#86e8a0] flex items-center justify-center font-medium text-xs tracking-wider flex-shrink-0 select-none"
                        aria-hidden="true"
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-semibold text-[#edf5ea] truncate">
                            {displayName}
                          </strong>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-[#163821] border border-[#29643a] text-[10px] text-[#7ce698] font-semibold tracking-wide flex-shrink-0 select-none">
                              You
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#7f997a] truncate mt-0.5">
                          {adm.email}
                        </span>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-[#0e2314] border border-[#1e4227] text-[11px] text-[#7ce698] font-medium flex-shrink-0 select-none">
                      Admin
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer close */}
          <div className="admin-drawer-dock">
            <button
              type="button"
              className="admin-button text-xs w-full justify-center min-h-[44px] touch-manipulation select-none active:scale-[0.98]"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </MorphingModal>
  )
}
