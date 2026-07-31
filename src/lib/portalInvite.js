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

const WHATSAPP_DISPLAY = '+267 71 573 094'

/**
 * Summary shown in the confirm dialog before invites are sent.
 * Keep in sync with the email body in supabase/functions/auth (invite_client).
 */
export function portalInviteConfirmMessage(count = 1) {
  const who =
    count === 1
      ? 'This client will receive an email that includes:'
      : `${count} clients will each receive an email that includes:`
  return (
    `${who}\n\n` +
    `• Portal sign-in link and temporary password (password123)\n` +
    `• Note that billing on the portal starts with the August invoice, with any balance carried forward from the previous system\n` +
    `• Reminder that iTreq Inc still holds earlier records on request\n` +
    `• WhatsApp support: ${WHATSAPP_DISPLAY}`
  )
}
