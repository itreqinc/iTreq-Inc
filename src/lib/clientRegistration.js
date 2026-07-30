import { inferCountryCodeFromPhone } from './phoneCountry'
import { normEmail, normIdNumber } from './clientValidation'

/**
 * `name` is a display-only column: auto-built from first/middle/surname
 * (same idea as iRegistry joining first + last at render / save).
 */
export function buildClientDisplayName({ first_name, middle_name, surname, name }) {
  const parts = [first_name, middle_name, surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (parts.length) return parts.join(' ')
  return String(name || '').trim()
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
    opening_balance: opening,
    opening_balance_date: opening !== 0 && dateRaw ? dateRaw : null,
  }
}

/** Absolute opening amount (client owes when positive). */
export function clientOpeningBalanceAmount(clientOrForm) {
  return Math.round((Number(clientOrForm?.opening_balance) || 0) * 100) / 100
}

export function clientOpeningBalanceDate(clientOrForm) {
  const d = String(clientOrForm?.opening_balance_date || '').trim().slice(0, 10)
  return d || ''
}
