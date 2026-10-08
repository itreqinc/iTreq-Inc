import { COMPANY } from '../data/site'
import { truncateEmail } from './authConfig'

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

const PORTAL_LOGIN_URL = 'https://www.itreqinc.com/login'

/**
 * Summary shown in the confirm dialog before invites are sent.
 * Keep in sync with the email body in supabase/functions/auth (invite_client).
 */
export function portalInviteConfirmMessage(count = 1, { email } = {}) {
  const loginEmail =
    count === 1 && email
      ? truncateEmail(email)
      : count === 1
        ? "the client's login email (masked)"
        : "each client's login email (masked)"
  const who =
    count === 1
      ? 'This client will receive an email inviting them to log in to the iTreq Inc portal to access their transactions. The email includes:'
      : `${count} clients will each receive an email inviting them to log in to the iTreq Inc portal to access their transactions. Each email includes:`
  return (
    `${who}\n\n` +
    `• Web address: ${PORTAL_LOGIN_URL}\n` +
    `• Login email: ${loginEmail}\n` +
    `• Temporary password: password123\n` +
    `• iTreq Inc cellphone: ${COMPANY.phone}\n` +
    `• iTreq Inc email: ${COMPANY.email}\n` +
    `• WhatsApp: ${COMPANY.whatsappDisplay} (https://wa.me/26771573094)`
  )
}
