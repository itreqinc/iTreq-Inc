/**
 * Text PDF of a Print / Save page.
 * Words are real PDF text (selectable, searchable). Logo and watermark images
 * are embedded as themselves — the page is not photographed.
 */

const PX_TO_MM = 25.4 / 96
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

function withPrintLayout(html) {
  const extra = `<style>
    .toolbar, .no-print { display: none !important; }
    html, body { height: auto !important; background: #fff !important; }
  </style>`
  const printable = String(html).replaceAll('@media print', '@media all')
  if (/<\/head>/i.test(printable)) return printable.replace(/<\/head>/i, `${extra}</head>`)
  return extra + printable
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

function mmValue(token) {
  const raw = String(token || '').trim()
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return 0
  if (raw.endsWith('px')) return n * PX_TO_MM
  return n
}

function parseMargin(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .map(mmValue)
    .filter((n) => Number.isFinite(n))
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] }
  }
  if (parts.length >= 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
  }
  return { top: 10, right: 11, bottom: 10, left: 11 }
}

function readPageMarginFromHtml(html) {
  const match = String(html || '').match(/@page[^{]*\{[^}]*\bmargin:\s*([^;]+);/i)
  if (!match) return { top: 10, right: 11, bottom: 10, left: 11 }
  return parseMargin(match[1])
}

function readPageMargin(doc) {
  const css = [...doc.querySelectorAll('style')]
    .map((style) => style.textContent || '')
    .join('\n')
  return readPageMarginFromHtml(css)
}

function parseColor(css) {
  const match = String(css || '').match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  )
  if (!match) return null
  const alpha = match[4] == null ? 1 : Number(match[4])
  if (!(alpha > 0.04)) return null
  return {
    r: Math.round(Number(match[1])),
    g: Math.round(Number(match[2])),
    b: Math.round(Number(match[3])),
    a: alpha,
  }
}

function isPaintedWhite(color) {
  return color.r > 248 && color.g > 248 && color.b > 248
}

function isSkipped(el) {
  const view = el.ownerDocument.defaultView
  let node = el
  while (node && node.nodeType === 1) {
    const tag = node.tagName
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true
    if (node.classList?.contains('no-print')) return true
    const style = view.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return true
    node = node.parentElement
  }
  return false
}

function fontName(style) {
  const family = String(style.fontFamily || '').toLowerCase()
  if (family.includes('courier') || family.includes('mono')) return 'courier'
  if (family.includes('times') || family.includes('georgia') || family.includes('serif')) {
    return 'times'
  }
  return 'helvetica'
}

function fontStyleName(style) {
  const weight = style.fontWeight
  const bold = weight === 'bold' || Number(weight) >= 600
  const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique'
  if (bold && italic) return 'bolditalic'
  if (bold) return 'bold'
  if (italic) return 'italic'
  return 'normal'
}

function rotationDeg(el) {
  const view = el.ownerDocument.defaultView
  let node = el
  while (node && node.nodeType === 1) {
    const transform = view.getComputedStyle(node).transform
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\(\s*([^,]+),\s*([^,]+)/)
      if (match) {
        const deg = (Math.atan2(parseFloat(match[2]), parseFloat(match[1])) * 180) / Math.PI
        if (Number.isFinite(deg) && Math.abs(deg) > 1) return deg
      }
    }
    node = node.parentElement
  }
  return 0
}

/** Helvetica in jsPDF is WinAnsi. Keep Latin-1 and fold the punctuation we emit. */
function pdfText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\xff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function imageDataUrl(img) {
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  if (!width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  try {
    ctx.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function boxOf(rect, origin) {
  return {
    x: (rect.left - origin.left) * PX_TO_MM,
    y: (rect.top - origin.top) * PX_TO_MM,
    w: rect.width * PX_TO_MM,
    h: rect.height * PX_TO_MM,
  }
}

function collectTextRuns(textNode, origin) {
  const raw = textNode.nodeValue
  if (!raw || !/\S/.test(raw)) return []
  const parent = textNode.parentElement
  if (!parent || isSkipped(parent)) return []
  const view = textNode.ownerDocument.defaultView
  const style = view.getComputedStyle(parent)
  const color = parseColor(style.color) || { r: 0, g: 0, b: 0, a: 1 }
  const fontSizePx = parseFloat(style.fontSize) || 13
  const fontSizePt = (fontSizePx * 72) / 96
  const angle = rotationDeg(parent)
  const range = textNode.ownerDocument.createRange()
  const runs = []
  let index = 0
  while (index < raw.length) {
    while (index < raw.length && raw[index] === '\n') index += 1
    if (index >= raw.length) break
    range.setStart(textNode, index)
    range.setEnd(textNode, index + 1)
    const first = range.getClientRects()[0]
    if (!first || first.height < 0.5) {
      index += 1
      continue
    }
    const lineTop = first.top
    let end = index + 1
    while (end < raw.length) {
      if (raw[end] === '\n') break
      range.setStart(textNode, end)
      range.setEnd(textNode, end + 1)
      const next = range.getClientRects()[0]
      if (next && next.height >= 0.5 && Math.abs(next.top - lineTop) > 1.5) break
      end += 1
    }
    range.setStart(textNode, index)
    range.setEnd(textNode, end)
    const rect = range.getBoundingClientRect()
    const text = pdfText(raw.slice(index, end))
    if (text && rect.width > 0.5 && rect.height > 0.5) {
      runs.push({
        kind: 'text',
        text,
        ...boxOf(rect, origin),
        color,
        font: fontName(style),
        fontStyle: fontStyleName(style),
        fontSizePt,
        angle,
        opacity: Math.min(1, parseFloat(style.opacity) || 1),
      })
    }
    index = end
  }
  return runs
}

function collectPaint(root) {
  const origin = root.getBoundingClientRect()
  const view = root.ownerDocument.defaultView
  const items = []
  const elements = [root, ...root.querySelectorAll('*')]
  for (const el of elements) {
    if (isSkipped(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 0.5 || rect.height < 0.5) continue
    const box = boxOf(rect, origin)
    if (el.tagName === 'IMG') {
      const url = imageDataUrl(el)
      if (!url) continue
      const style = view.getComputedStyle(el)
      items.push({
        kind: 'image',
        ...box,
        url,
        opacity: Math.min(1, parseFloat(style.opacity) || 1),
      })
      continue
    }
    const style = view.getComputedStyle(el)
    const background = parseColor(style.backgroundColor)
    if (background && !isPaintedWhite(background)) {
      items.push({ kind: 'fill', ...box, color: background })
    }
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const width = parseFloat(style[`border${side[0].toUpperCase()}${side.slice(1)}Width`]) || 0
      const borderStyle = style[`border${side[0].toUpperCase()}${side.slice(1)}Style`]
      const color = parseColor(style[`border${side[0].toUpperCase()}${side.slice(1)}Color`])
      if (width < 0.4 || !color || borderStyle === 'none' || borderStyle === 'hidden') continue
      items.push({
        kind: 'border',
        ...box,
        side,
        lineMm: Math.max(0.1, width * PX_TO_MM),
        color,
      })
    }
  }

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    items.push(...collectTextRuns(node, origin))
    node = walker.nextNode()
  }
  return items.filter((item) => item.w > 0 && item.h > 0 && item.y > -2)
}

/**
 * Keep a row together when it would be sliced by a page edge.
 * Tall images stay put and are clipped per page.
 */
function keepRowsIntact(items, contentHeight) {
  const sorted = items.sort((a, b) => a.y - b.y || a.x - b.x)
  let extra = 0
  let pageLimit = contentHeight
  for (const item of sorted) {
    if (item.h > contentHeight * 0.85) {
      item.y += extra
      continue
    }
    let start = item.y + extra
    while (start >= pageLimit - 0.4) pageLimit += contentHeight
    if (start + item.h > pageLimit - 0.4) {
      extra += pageLimit - start
      pageLimit += contentHeight
    }
    item.y += extra
  }
  return sorted
}

function ensurePage(pdf, pageIndex) {
  while (pdf.getNumberOfPages() < pageIndex + 1) pdf.addPage()
  pdf.setPage(pageIndex + 1)
}

function withOpacity(pdf, opacity, draw) {
  if (!(opacity < 0.99)) {
    draw()
    return
  }
  pdf.setGState(new pdf.GState({ opacity }))
  draw()
  pdf.setGState(new pdf.GState({ opacity: 1 }))
}

function drawSlices(pdf, item, contentHeight, margin, draw) {
  let y = Math.max(0, item.y)
  let remaining = item.h
  const x = item.x + margin.left
  while (remaining > 0.15) {
    const page = Math.floor(y / contentHeight)
    const yOnPage = y - page * contentHeight
    const take = Math.min(remaining, contentHeight - yOnPage)
    ensurePage(pdf, page)
    draw({
      page,
      x,
      y: yOnPage + margin.top,
      w: item.w,
      h: take,
      contentY: y,
    })
    y += take
    remaining -= take
  }
}

function paintPdf(pdf, items, margin) {
  const contentHeight = A4_HEIGHT_MM - margin.top - margin.bottom
  const placed = keepRowsIntact(items, contentHeight)
  const fills = placed.filter((item) => item.kind === 'fill')
  const images = placed.filter((item) => item.kind === 'image')
  const borders = placed.filter((item) => item.kind === 'border')
  const texts = placed.filter((item) => item.kind === 'text')

  for (const item of fills) {
    drawSlices(pdf, item, contentHeight, margin, ({ x, y, w, h }) => {
      withOpacity(pdf, item.color.a, () => {
        pdf.setFillColor(item.color.r, item.color.g, item.color.b)
        pdf.rect(x, y, w, h, 'F')
      })
    })
  }

  for (const item of images) {
    let y = Math.max(0, item.y)
    const bottom = item.y + item.h
    const x = item.x + margin.left
    while (y < bottom - 0.15) {
      const page = Math.floor(y / contentHeight)
      ensurePage(pdf, page)
      const yOnPage = margin.top + (item.y - page * contentHeight)
      withOpacity(pdf, item.opacity, () => {
        pdf.addImage(item.url, 'PNG', x, yOnPage, item.w, item.h)
      })
      y = (page + 1) * contentHeight
    }
  }

  for (const item of borders) {
    const x = item.x + margin.left
    const endY = item.y + item.h
    pdf.setDrawColor(item.color.r, item.color.g, item.color.b)
    pdf.setLineWidth(item.lineMm)
    if (item.side === 'top' || item.side === 'bottom') {
      const yAbs = Math.max(0, item.side === 'top' ? item.y : endY)
      const page = Math.floor(yAbs / contentHeight)
      const y = yAbs - page * contentHeight + margin.top
      ensurePage(pdf, page)
      pdf.line(x, y, x + item.w, y)
      continue
    }
    const startPage = Math.floor(Math.max(0, item.y) / contentHeight)
    const endPage = Math.floor(Math.max(0, endY - 0.05) / contentHeight)
    for (let page = startPage; page <= endPage; page += 1) {
      const pageTop = page * contentHeight
      const y1 = Math.max(item.y, pageTop)
      const y2 = Math.min(endY, pageTop + contentHeight)
      if (y2 - y1 < 0.1) continue
      ensurePage(pdf, page)
      const xLine = item.side === 'left' ? x : x + item.w
      pdf.line(xLine, y1 - pageTop + margin.top, xLine, y2 - pageTop + margin.top)
    }
  }

  for (const item of texts) {
    const page = Math.floor(Math.max(0, item.y) / contentHeight)
    const yOnPage = item.y - page * contentHeight
    const x = item.x + margin.left
    const top = yOnPage + margin.top
    ensurePage(pdf, page)
    withOpacity(pdf, item.opacity, () => {
      pdf.setFont(item.font, item.fontStyle)
      let size = item.fontSizePt
      pdf.setFontSize(size)
      const natural = pdf.getTextWidth(item.text)
      if (natural > item.w + 0.4 && natural > 0 && Math.abs(item.angle) < 1) {
        size *= (item.w + 0.2) / natural
        pdf.setFontSize(size)
      }
      pdf.setTextColor(item.color.r, item.color.g, item.color.b)
      const baseline = top + size * 0.3528 * 0.82
      if (Math.abs(item.angle) > 1) {
        pdf.text(item.text, x + item.w / 2, top + item.h / 2, {
          angle: item.angle,
          align: 'center',
          baseline: 'middle',
        })
      } else {
        pdf.text(item.text, x, baseline)
      }
    })
  }
}

/**
 * @param {string} html Print / Save page HTML
 * @returns {Promise<string>} base64 PDF (no data-URI prefix)
 */
export async function htmlPrintToPdfBase64(html) {
  if (typeof document === 'undefined') {
    throw new Error('PDF creation is only available in the browser.')
  }
  const { jsPDF } = await import('jspdf')

  const marginGuess = readPageMarginFromHtml(html)
  const contentWidthMm = A4_WIDTH_MM - marginGuess.left - marginGuess.right
  const widthPx = Math.max(320, Math.round(contentWidthMm / PX_TO_MM))
  const holder = document.createElement('iframe')
  holder.setAttribute('aria-hidden', 'true')
  holder.setAttribute('tabindex', '-1')
  holder.style.cssText = `position:fixed;left:-12000px;top:0;width:${widthPx}px;height:1400px;border:0;opacity:0;pointer-events:none;background:#fff;`
  document.body.appendChild(holder)

  try {
    const frameDoc = holder.contentDocument
    if (!frameDoc) throw new Error('Could not prepare the printable document.')
    frameDoc.open()
    frameDoc.write(withPrintLayout(html))
    frameDoc.close()

    const margin = readPageMargin(frameDoc)

    if (frameDoc.fonts?.ready) {
      try {
        await frameDoc.fonts.ready
      } catch {
        /* ignore */
      }
    }
    await waitForImages(frameDoc)
    const root = frameDoc.querySelector('.doc') || frameDoc.body
    holder.style.height = `${Math.max(1400, root.scrollHeight + 80)}px`
    await new Promise((resolve) => window.setTimeout(resolve, 40))

    const items = collectPaint(root)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    paintPdf(pdf, items, margin)

    const dataUri = pdf.output('datauristring')
    const comma = dataUri.indexOf(',')
    return comma === -1 ? dataUri : dataUri.slice(comma + 1)
  } finally {
    holder.remove()
  }
}
