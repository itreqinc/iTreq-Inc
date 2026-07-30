import { COMPANY } from '../data/site'

/** Clients registered with the office inbox instead of their own address. */
export function isOfficePlaceholderEmail(email) {
  const e = String(email || '')
    .trim()
    .toLowerCase()
  if (!e) return false
  return e === String(COMPANY.email || '')
    .trim()
    .toLowerCase()
}

/** True when this address can receive a portal invite email. */
export function canSendPortalInviteEmail(email) {
  const e = String(email || '').trim()
  if (!e) return false
  return !isOfficePlaceholderEmail(e)
}
