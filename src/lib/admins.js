import { supabase } from '../utils/supabase.js'

let cachedAdmins = null
let fetchPromise = null

export function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Formats a clean, readable human name from an email address or username.
 * Gracefully strips numbers, symbols and splits compound names.
 */
export function formatDisplayNameFromEmail(email) {
  if (!email || typeof email !== 'string') return 'Admin'
  const username = email.split('@')[0] || ''
  let clean = username.replace(/[._-]+/g, ' ').trim()
  clean = clean.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return 'Admin'

  if (clean.includes(' ')) {
    return clean
      .split(/\s+/)
      .map(capitalize)
      .join(' ')
  }

  const knownSplits = [
    { match: /^abdul(faruk|latif|samad|kalam|hakeem|wahid|rahman|aziz|basit)/i, split: m => `Abdul ${capitalize(m[1])}` },
    { match: /^aneeq(ahamed|ahmed)/i, split: m => `Aneeq ${capitalize(m[1])}` },
    { match: /^nethmitha(kariyawasam)?/i, split: m => m[1] ? `Nethmitha ${capitalize(m[1])}` : 'Nethmitha' },
    { match: /^sasindu(ranasinghe)?/i, split: m => m[1] ? `Sasindu ${capitalize(m[1])}` : 'Sasindu' },
    { match: /^hasarinda/i, split: () => 'Hasarinda' },
  ]

  for (const { match, split } of knownSplits) {
    if (match.test(clean)) {
      return split(clean.match(match))
    }
  }

  return capitalize(clean)
}

/**
 * Derives clean 2-letter uppercase initials for avatar badges.
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return 'AD'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (name[0] || 'A').toUpperCase()
}

/**
 * Retrieves the list of administrators from Supabase, enriched with display names.
 * Returns an array of admin objects with properties:
 * { user_id, id, email, full_name, initials, email_confirmed_at, role, in_private_admins, created_at, last_sign_in_at }
 */
export async function getAdminsList(forceRefresh = false) {
  if (!supabase) return []
  if (cachedAdmins && !forceRefresh) return cachedAdmins
  if (fetchPromise && !forceRefresh) return fetchPromise

  const rpcPromise = supabase.rpc('get_admins')
  const reservationsPromise = supabase
    .from('reservations')
    .select('user_id, email, full_name')
    .not('full_name', 'is', null)
    .then(res => res)
    .catch(() => ({ data: [] }))

  fetchPromise = Promise.all([rpcPromise, reservationsPromise])
    .then(([{ data, error }, resResult]) => {
      fetchPromise = null
      if (!error && Array.isArray(data)) {
        const reservations = Array.isArray(resResult?.data) ? resResult.data : []
        const nameByEmail = new Map()
        const nameByUid = new Map()

        for (const r of reservations) {
          if (r?.full_name?.trim()) {
            if (r.email) nameByEmail.set(r.email.trim().toLowerCase(), r.full_name.trim())
            if (r.user_id) nameByUid.set(r.user_id, r.full_name.trim())
          }
        }

        const enriched = data.map((admin) => {
          const uid = admin.user_id || admin.id
          const email = (admin.email || '').trim()
          const emailLower = email.toLowerCase()

          const resolvedName =
            admin.full_name ||
            (uid && nameByUid.get(uid)) ||
            (emailLower && nameByEmail.get(emailLower)) ||
            formatDisplayNameFromEmail(email)

          return {
            ...admin,
            full_name: resolvedName,
            initials: getInitials(resolvedName),
          }
        })
        cachedAdmins = enriched
        return enriched
      }
      return cachedAdmins || []
    })
    .catch(() => {
      fetchPromise = null
      return cachedAdmins || []
    })

  return fetchPromise
}

/**
 * Builds a lookup map of user UUID to admin display name (or email).
 */
export function buildAdminMap(admins = []) {
  const map = {}
  if (!Array.isArray(admins)) return map
  for (const a of admins) {
    const uid = a.user_id || a.id
    if (uid) {
      map[uid] = a.full_name || a.email || 'Admin'
    }
  }
  return map
}

/**
 * Resolves a reviewer UUID to an admin display name or fallback.
 */
export function getAdminDisplayName(uuid, adminMap = {}) {
  if (!uuid) return null
  if (adminMap[uuid]) return adminMap[uuid]
  return `Admin (${uuid.slice(0, 8)}…)`
}


