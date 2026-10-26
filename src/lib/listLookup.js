/** Case-insensitive list search. Ignores spaces and commas so "1500" matches "1,500.00". */
export function matchesListQuery(query, parts) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const hay = (parts || [])
    .filter((part) => part != null && String(part).trim() !== '')
    .map((part) => String(part).toLowerCase())
    .join(' ')
  if (hay.includes(q)) return true
  const compactQ = q.replace(/[\s,]/g, '')
  if (!compactQ) return true
  return hay.replace(/[\s,]/g, '').includes(compactQ)
}

/** Active clients plus any client that still appears on a list row. */
export function clientsForLookup(clients, rows) {
  const byId = new Map()
  for (const client of clients || []) {
    if (!client?.id) continue
    byId.set(String(client.id), client)
  }
  for (const row of rows || []) {
    const id = row?.client_id
    if (!id || byId.has(String(id))) continue
    byId.set(String(id), {
      id,
      name: row.clients?.name || 'Client',
    })
  }
  return [...byId.values()].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
  )
}

export function clientSearchParts(client) {
  if (!client) return []
  return [client.name, client.company_name, client.email, client.phone, client.cellphone, client.id_number]
    .concat((client.contact_emails || []).map((row) => row.email))
}
