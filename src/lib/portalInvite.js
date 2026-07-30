import { COMPANY } from '../data/site'

const OFFICE_PLACEHOLDER_EMAILS = new Set(
  ['info@itreqinc.com', COMPANY.email]
    .map((e) =>
      String(e || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ''),
    )
    .filter(Boolean),
)

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** Clients registered with the office inbox instead of their own address. */
export function isOfficePlaceholderEmail(email) {
  const e = normalizeEmail(email)
  if (!e) return false
  return OFFICE_PLACEHOLDER_EMAILS.has(e)
}

/** True when this address can receive a portal invite email. */
export function canSendPortalInviteEmail(email) {
  const e = normalizeEmail(email)
  if (!e) return false
  return !isOfficePlaceholderEmail(e)
}
