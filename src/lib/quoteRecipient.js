/** Composite key for quotation client/lead picker: `client:<uuid>` or `lead:<uuid>`. */

export function buildRecipientKey(kind, id) {
  if (!id) return ''
  return `${kind}:${id}`
}

export function parseRecipientKey(key) {
  if (!key || typeof key !== 'string') {
    return { kind: null, id: null, client_id: null, contact_submission_id: null }
  }
  const [kind, ...rest] = key.split(':')
  const id = rest.join(':')
  if (!id) return { kind: null, id: null, client_id: null, contact_submission_id: null }
  if (kind === 'client') {
    return { kind: 'client', id, client_id: id, contact_submission_id: null }
  }
  if (kind === 'lead') {
    return { kind: 'lead', id, client_id: null, contact_submission_id: id }
  }
  return { kind: null, id: null, client_id: null, contact_submission_id: null }
}

export function recipientKeyFromQuotation(row) {
  if (row?.client_id) return buildRecipientKey('client', row.client_id)
  if (row?.contact_submission_id) return buildRecipientKey('lead', row.contact_submission_id)
  return ''
}

export function quotationRecipientName(row) {
  if (row?.clients?.name) return row.clients.name
  if (row?.contact_submissions?.name) return `${row.contact_submissions.name} (lead)`
  return '—'
}

/** Map a lead row to a client-shaped object for billing documents. */
export function leadAsBillingClient(lead) {
  if (!lead) return null
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.cellphone || lead.phone,
    cellphone: lead.cellphone || lead.phone,
    landline: lead.landline,
    postal_address: lead.postal_address,
    physical_address: lead.physical_address || lead.address,
    address: lead.physical_address || lead.address,
    id_number: lead.id_number,
    country: lead.country,
    first_name: lead.first_name,
    middle_name: lead.middle_name,
    surname: lead.surname,
    gender: lead.gender,
    notes: lead.notes,
  }
}
