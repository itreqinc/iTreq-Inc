function normEmail(value) {
  const text = String(value ?? '').trim()
  return text ? text.toLowerCase() : ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Login address plus ticked extra addresses. Individuals have only the login address. */
export function clientCommunicationEmails(client) {
  const login = normEmail(client?.email)
  const extras = client?.is_company
    ? (client.contact_emails || [])
        .filter((row) => row && row.receives_communication !== false)
        .map((row) => normEmail(row.email || row))
    : []
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

/**
 * Extra addresses on one company account.
 * Shared across accounts is allowed. Repeating this account's login email is not.
 */
export function normalizeContactEmails(form) {
  if (!form?.is_company) return { ok: true, rows: [] }
  const login = normEmail(form.email)
  const seen = new Set()
  const rows = []
  for (const row of form.contact_emails || []) {
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
    seen.add(email)
    rows.push({
      email,
      receives_communication: row.receives_communication !== false,
    })
  }
  return { ok: true, rows }
}
