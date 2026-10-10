/** A4 width at 96dpi — matches the print document max-width. */
const A4_WIDTH_PX = 794

function withPdfCaptureCss(html) {
  const extra = `<style>
    .toolbar, .no-print { display: none !important; }
    html, body { height: auto !important; background: #fff !important; }
    .doc { min-height: 0 !important; margin: 0 auto !important; }
  </style>`
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${extra}</head>`)
  return extra + html
}

function waitForImages(doc) {
  const images = [...(doc.images || [])]
  return Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    ),
  )
}

/**
 * Render existing print/email HTML in a hidden iframe and paginate it onto A4 PDF pages.
 * @param {string} html
 * @returns {Promise<string>} base64 PDF (no data-URI prefix)
 */
export async function htmlPrintToPdfBase64(html) {
  if (typeof document === 'undefined') {
    throw new Error('PDF capture is only available in the browser.')
  }
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('tabindex', '-1')
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${A4_WIDTH_PX}px;height:1123px;border:0;opacity:0;pointer-events:none;`
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('Could not prepare the printable document.')
    doc.open()
    doc.write(withPdfCaptureCss(html))
    doc.close()
    if (doc.fonts?.ready) {
      try {
        await doc.fonts.ready
      } catch {
        /* ignore */
      }
    }
    await waitForImages(doc)
    const target = doc.querySelector('.doc') || doc.body
    iframe.style.height = `${Math.max(1123, target.scrollHeight + 48)}px`
    await new Promise((r) => window.setTimeout(r, 40))

    const canvas = await html2canvas(target, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: A4_WIDTH_PX,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const imgData = canvas.toDataURL('image/jpeg', 0.82)

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0.5) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    const dataUri = pdf.output('datauristring')
    const comma = dataUri.indexOf(',')
    return comma === -1 ? dataUri : dataUri.slice(comma + 1)
  } finally {
    iframe.remove()
  }
}
