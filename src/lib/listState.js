/** Merge `row` into `list` by `id` (prepend if new). Preserves existing fields not in `row`. */
export function upsertById(list, row) {
  if (!row?.id) return list || []
  const prev = list || []
  const i = prev.findIndex((r) => r.id === row.id)
  if (i === -1) return [row, ...prev]
  const next = prev.slice()
  next[i] = { ...next[i], ...row }
  return next
}

export function removeById(list, id) {
  return (list || []).filter((r) => r.id !== id)
}
