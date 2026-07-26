/**
 * Display name for users (same idea as clients: first + middle + surname).
 */
export function buildUserDisplayName({ first_name, middle_name, surname, name }) {
  const parts = [first_name, middle_name, surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (parts.length) return parts.join(' ')
  return String(name || '').trim()
}
