import { COMPANY } from '../data/site'

/**
 * Letterhead + banking for printable quotes/invoices from company_settings.
 * Falls back to public site COMPANY when DB fields are empty.
 */
export function documentLetterheadFromSettings(settings) {
  const addressRaw = settings?.letterhead_address?.trim() || ''
  let addressLines = addressRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (!addressLines.length && COMPANY.location) {
    addressLines = [COMPANY.location]
  }

  const contactPhone = settings?.letterhead_phone?.trim() || COMPANY.phone || ''

  const email = settings?.letterhead_email?.trim() || COMPANY.email || ''

  const bankingRaw = settings?.banking_details?.trim() || ''
  const bankingLines = bankingRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  return {
    addressLines,
    contactPhone,
    email,
    bankingLines,
  }
}

export const emptyDocumentSettingsFields = {
  letterhead_address: '',
  letterhead_phone: '',
  letterhead_email: '',
  banking_details: '',
}
