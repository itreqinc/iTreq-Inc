import { closePrintBrowser, printHtmlToPdfBase64 } from './printHtmlToPdf.js'

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('Document is too large to print.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Missing document.'))
      }
    })
    req.on('error', reject)
  })
}

async function handle(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'POST only.' }))
    return
  }
  try {
    const body = await readBody(req, 14_000_000)
    const pdf = await printHtmlToPdfBase64(body?.html)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ pdf }))
  } catch (err) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err?.message || 'Could not create the print PDF.' }))
  }
}

export function printPdfPlugin() {
  const attach = (server) => {
    server.httpServer?.on('close', () => {
      closePrintBrowser()
    })
    server.middlewares.use('/api/print-pdf', (req, res) => {
      handle(req, res).catch((err) => {
        if (res.headersSent || res.writableEnded) return
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: err?.message || 'Could not create the print PDF.' }))
      })
    })
  }
  return {
    name: 'print-pdf',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}
