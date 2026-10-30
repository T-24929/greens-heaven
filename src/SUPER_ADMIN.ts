/**
 * Super Administrator configuration.
 *
 * Super admins have elevated privileges to adjust ticket payment deductions
 * (e.g. for attendees given free passes or half-paid concessions due to financial hardship).
 */

export const SUPER_ADMINS = [
  'hasaridnda986@gmail.com',
  'hasarinda986@gmail.com',
  'sasinduranasinghe121@gmail.com',
] as const

export const SUPER_ADMIN_EMAILS = SUPER_ADMINS

/**
 * Checks whether an email address belongs to a designated super administrator.
 */
export function isSuperAdmin(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  return SUPER_ADMINS.some((admin) => admin.toLowerCase() === normalized)
}
