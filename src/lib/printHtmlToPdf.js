/**
 * The reminder attachment is the Print / Save page, printed by the browser.
 * @param {string} html Print / Save page HTML
 * @returns {Promise<string>} base64 PDF (no data-URI prefix)
 */
export async function htmlPrintToPdfBase64(html) {
  const res = await fetch('/api/print-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  })
  const raw = await res.text()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    data = null
  }
  if (!res.ok || !data?.pdf) {
    throw new Error(data?.error || 'Could not create the print PDF.')
  }
  return data.pdf
}
