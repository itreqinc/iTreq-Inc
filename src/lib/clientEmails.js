function normEmail(value) {
  const text = String(value ?? '').trim()
  return text ? text.toLowerCase() : ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Individuals: login + 1 extra. Companies: unlimited extras. */
export const MAX_INDIVIDUAL_EXTRA_EMAILS = 1

/** Login address plus ticked extra addresses (documents / statements). */
export function clientCommunicationEmails(client) {
  const login = normEmail(client?.email)
  const extras = (client?.contact_emails || [])
    .filter((row) => row && row.receives_communication !== false)
    .map((row) => normEmail(row.email || row))
  const out = []
  const seen = new Set()
  for (const email of [login, ...extras]) {
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

/** Recipients already placed on a document model, or derived from a client. */
export function documentRecipients(client) {
  if (Array.isArray(client?.communicationEmails) && client.communicationEmails.length) {
    return client.communicationEmails
  }
  return clientCommunicationEmails(client)
}

export function formatRecipientList(emails) {
  return (emails || []).filter(Boolean).join(', ')
}

export function maxExtraEmailsForClient(formOrClient) {
  return formOrClient?.is_company ? Infinity : MAX_INDIVIDUAL_EXTRA_EMAILS
}

/**
 * Extra addresses on one account (not used for portal login).
 * Shared across accounts is allowed. Repeating this account's login email is not.
 * Individuals may have at most one extra; companies are unlimited.
 */
export function normalizeContactEmails(form) {
  const login = normEmail(form?.email)
  const seen = new Set()
  const rows = []
  const maxExtra = maxExtraEmailsForClient(form)
  for (const row of form?.contact_emails || []) {
    const email = normEmail(row?.email)
    if (!email) continue
    if (!EMAIL_RE.test(email)) {
      return { ok: false, message: `Enter a valid email address for ${email}.` }
    }
    if (email === login) {
      return {
        ok: false,
        message: 'An extra email cannot be the same as this account’s login email.',
      }
    }
    if (seen.has(email)) {
      return { ok: false, message: `${email} is listed more than once on this account.` }
    }
    if (rows.length >= maxExtra) {
      return {
        ok: false,
        message: form?.is_company
          ? 'Too many extra emails on this account.'
          : 'Individuals can have one login email and one extra email.',
      }
    }
    seen.add(email)
    rows.push({
      email,
      receives_communication: row.receives_communication !== false,
    })
  }
  return { ok: true, rows }
}
