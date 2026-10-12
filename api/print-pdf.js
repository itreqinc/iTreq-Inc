import { printHtmlToPdfBase64 } from '../server/printHtmlToPdf.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only.' })
    return
  }
  try {
    let body = req.body
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }
    const pdf = await printHtmlToPdfBase64(body?.html)
    res.status(200).json({ pdf })
  } catch (err) {
    res.status(400).json({ error: err?.message || 'Could not create the print PDF.' })
  }
}
