import { validatePhoneForCountry } from './phoneCountry'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normStr(v) {
  return String(v ?? '').trim()
}

export function normIdNumber(v) {
  return String(v ?? '')
    .replace(/\s+/g, '')
    .trim()
}

export function normEmail(v) {
  const s = String(v ?? '').trim()
  return s ? s.toLowerCase() : ''
}

/**
 * Client form validation (aligned with iRegistry staff/signup rules).
 * @returns {{ ok: true } | { ok: false, message: string, field?: string }}
 */
export function validateClientForm(form) {
  if (!normStr(form.first_name)) {
    return { ok: false, message: 'First name is required.', field: 'first_name' }
  }
  if (!normStr(form.surname)) {
    return { ok: false, message: 'Surname is required.', field: 'surname' }
  }

  const idn = normIdNumber(form.id_number)
  if (!idn) {
    return { ok: false, message: 'ID / Passport number is required.', field: 'id_number' }
  }

  const phoneCheck = validatePhoneForCountry(form.country, form.cellphone)
  if (!phoneCheck.ok) {
    return { ...phoneCheck, field: 'cellphone' }
  }

  const email = normEmail(form.email)
  if (!email) {
    return { ok: false, message: 'Email address is required.', field: 'email' }
  }
  if (!EMAIL_RE.test(String(form.email ?? '').trim())) {
    return { ok: false, message: 'Enter a valid email address.', field: 'email' }
  }

  return { ok: true }
}
