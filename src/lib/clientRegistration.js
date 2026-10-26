import { inferCountryCodeFromPhone } from './phoneCountry'
import { normEmail, normIdNumber } from './clientValidation'

/**
 * `name` is a display-only column: auto-built from first/middle/surname
 * (same idea as iRegistry joining first + last at render / save).
 */
export function buildClientDisplayName({
  first_name,
  middle_name,
  surname,
  name,
  is_company,
  company_name,
}) {
  if (is_company) {
    const company = String(company_name || '').trim()
    if (company) return company
  }
  const parts = [first_name, middle_name, surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (parts.length) return parts.join(' ')
  return String(name || '').trim()
}

export function contactPersonName({ first_name, middle_name, surname }) {
  return [first_name, middle_name, surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
}

function formToPersonRow(form) {
  const displayName = buildClientDisplayName(form)
  const cellphone = form.cellphone?.trim() || null
  const physical = form.physical_address?.trim() || null
  const gender = form.gender === 'M' || form.gender === 'F' ? form.gender : null
  return {
    name: displayName,
    phone: cellphone,
    email: normEmail(form.email) || null,
    address: physical,
    notes: form.notes?.trim() || null,
    gender,
    first_name: form.first_name?.trim() || null,
    middle_name: form.middle_name?.trim() || null,
    surname: form.surname?.trim() || null,
    id_number: normIdNumber(form.id_number) || null,
    country: form.country?.trim() || null,
    cellphone,
    landline: form.landline?.trim() || null,
    postal_address: form.postal_address?.trim() || null,
    physical_address: physical,
  }
}

export function emptyClientForm() {
  return {
    gender: '',
    first_name: '',
    middle_name: '',
    surname: '',
    id_number: '',
    country: 'BW',
    cellphone: '+267',
    email: '',
    landline: '',
    postal_address: '',
    physical_address: '',
    notes: '',
    is_company: false,
    company_name: '',
    contact_emails: [],
    opening_balance: '',
    opening_balance_date: '',
  }
}

export function clientToForm(client) {
  const base = emptyClientForm()
  if (!client) return base

  const phone = client.cellphone || client.phone || ''
  const country =
    client.country ||
    client.phone_country ||
    inferCountryCodeFromPhone(phone) ||
    base.country

  const opening = Number(client.opening_balance)
  return {
    gender: client.gender || '',
    first_name: client.first_name || '',
    middle_name: client.middle_name || '',
    surname: client.surname || '',
    id_number: client.id_number || '',
    country,
    cellphone: phone || base.cellphone,
    email: client.email || '',
    landline: client.landline || '',
    postal_address: client.postal_address || '',
    physical_address: client.physical_address || client.address || '',
    notes: client.notes || '',
    is_company: Boolean(client.is_company),
    company_name: client.company_name || '',
    contact_emails: (client.contact_emails || []).map((row) => ({
      email: row.email || '',
      receives_communication: row.receives_communication !== false,
    })),
    opening_balance:
      Number.isFinite(opening) && opening !== 0 ? String(opening) : opening === 0 ? '0' : '',
    opening_balance_date: client.opening_balance_date
      ? String(client.opening_balance_date).slice(0, 10)
      : '',
  }
}

/** Leads use the same registration shape as clients (without opening balance). */
export const contactSubmissionToForm = clientToForm

export function formToContactSubmissionRow(form) {
  return formToPersonRow(form)
}

export function formToClientRow(form) {
  const opening = Math.round((Number(form.opening_balance) || 0) * 100) / 100
  const dateRaw = String(form.opening_balance_date || '').trim().slice(0, 10)
  return {
    ...formToPersonRow(form),
    is_company: Boolean(form.is_company),
    company_name: String(form.company_name || '').trim() || null,
    opening_balance: opening,
    opening_balance_date: opening !== 0 && dateRaw ? dateRaw : null,
  }
}

/** Original opening amount (client owes when positive). Remaining is derived. */
export function clientOpeningBalanceAmount(clientOrForm) {
  return Math.round((Number(clientOrForm?.opening_balance) || 0) * 100) / 100
}

export function clientOpeningBalanceDate(clientOrForm) {
  const d = String(clientOrForm?.opening_balance_date || '').trim().slice(0, 10)
  return d || ''
}
