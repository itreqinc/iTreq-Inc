import countries from '../data/countries.json'

export { countries }

/** True when the user entered national digits, not just the country dial code. */
export function isPhoneEntered(countryCode, phone) {
  const cc = String(countryCode ?? '').trim()
  const ph = String(phone ?? '').trim()
  if (!cc || !ph) return false

  const meta = countries.find((c) => c.code === cc)
  if (!meta) return false

  const digitsOnly = ph.replace(/\D/g, '')
  const nationalNumber = digitsOnly.replace(String(meta.dialCode).replace('+', ''), '')
  return nationalNumber.length > 0
}

/** Best-effort ISO country code from stored E.164-style phone. */
export function inferCountryCodeFromPhone(phone) {
  const digitsOnly = String(phone ?? '').replace(/\D/g, '')
  if (!digitsOnly) return ''

  const sorted = [...countries].sort(
    (a, b) => String(b.dialCode).length - String(a.dialCode).length,
  )

  for (const c of sorted) {
    const dialDigits = String(c.dialCode).replace(/\D/g, '')
    if (dialDigits && digitsOnly.startsWith(dialDigits)) {
      return c.code
    }
  }
  return ''
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePhoneForCountry(countryCode, phone) {
  const cc = String(countryCode ?? '').trim()
  if (!cc) {
    return { ok: false, message: 'Country is required. Please select a country from the list.' }
  }

  const meta = countries.find((c) => c.code === cc)
  if (!meta) {
    return { ok: false, message: 'Invalid country selection. Please choose again.' }
  }

  const ph = String(phone ?? '').trim()
  if (!ph) {
    return { ok: false, message: 'Phone number is required.' }
  }

  if (!isPhoneEntered(cc, ph)) {
    return { ok: false, message: 'Enter the phone number after the country code.' }
  }

  const digitsOnly = ph.replace(/\D/g, '')
  const nationalNumber = digitsOnly.replace(String(meta.dialCode).replace('+', ''), '')
  const length = nationalNumber.length

  if (length < meta.minLength || length > meta.maxLength) {
    return {
      ok: false,
      message: `Phone number must be between ${meta.minLength} and ${meta.maxLength} digits for ${meta.name}.`,
    }
  }

  return { ok: true }
}
