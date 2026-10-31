/**
 * Administrator permission and role configurations.
 */

export const SUPER_ADMINS = [
  'hasaridnda986@gmail.com',
  'hasarinda986@gmail.com',
  'sasinduranasinghe121@gmail.com',
]

export const SUPER_ADMIN_EMAILS = SUPER_ADMINS

/**
 * Administrators granted restricted view-only (read-only) access to the Financial Tab.
 */
export const FINANCIAL_VIEW_ONLY_ADMINS = [
  'nethmithakariyawasam@gmail.com',
]

export const FINANCIAL_VIEW_ONLY_EMAILS = FINANCIAL_VIEW_ONLY_ADMINS

/**
 * Checks whether an email address belongs to a designated super administrator.
 */
export function isSuperAdmin(email) {
  if (!email || typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  return SUPER_ADMINS.some((admin) => admin.toLowerCase() === normalized)
}

/**
 * Checks whether an email address has view-only access to the Financial tab.
 */
export function isFinancialViewOnly(email) {
  if (!email || typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  return FINANCIAL_VIEW_ONLY_ADMINS.some((admin) => admin.toLowerCase() === normalized)
}

/**
 * Checks whether an email address can access (view or manage) the Financial tab.
 */
export function canAccessFinancialTab(email) {
  return isSuperAdmin(email) || isFinancialViewOnly(email)
}

/**
 * Checks whether an email address has full management rights (add/edit/delete) over financial records.
 */
export function canManageFinancials(email) {
  return isSuperAdmin(email)
}
