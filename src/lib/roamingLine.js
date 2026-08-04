/** Default invoice description for a roaming / usage charge line. */
export function buildRoamingDescription(productName, detail) {
  const base = String(productName || 'Roaming').trim()
  const note = String(detail || '').trim()
  if (!note) return base
  return `${base} — ${note}`
}
