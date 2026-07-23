import {
  buildBillingDocumentEmailHtml,
  buildBillingDocumentModel,
  buildBillingDocumentPlainText,
  buildBillingDocumentPrintPage,
  getBillingDocumentPrintPath,
} from './billingDocumentHtml'

const LOADING_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Loading…</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;color:#333}</style></head>
<body><p>Loading document…</p></body></html>`

/**
 * Must run synchronously inside the click handler (before any await).
 * Do not pass noopener — that makes window.open return null in modern browsers.
 */
export function openBillingDocumentPrintWindow() {
  const win = window.open('about:blank', '_blank')
  if (!win) {
    return {
      ok: false,
      message:
        'Could not open a new tab. Allow pop-ups for this site, or try again from the Print / Save PDF button.',
    }
  }
  try {
    win.document.open()
    win.document.write(LOADING_HTML)
    win.document.close()
  } catch {
    /* cross-origin shouldn't happen for about:blank */
  }
  return { ok: true, win }
}

/**
 * Write arbitrary printable HTML into a window opened with openBillingDocumentPrintWindow.
 */
export function fillPrintWindowWithHtml(win, { html, title, path }) {
  if (!win || win.closed) {
    return { ok: false, message: 'The print tab was closed before the document loaded.' }
  }
  try {
    win.document.open()
    win.document.write(html)
    win.document.close()
    try {
      if (path) win.history.replaceState(null, title || '', path)
    } catch {
      /* ignore — footer may still show about:blank in some browsers */
    }
    win.focus()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not write the printable document.'
    return { ok: false, message }
  }
  return { ok: true }
}

export function fillBillingDocumentPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildBillingDocumentPrintPage(model),
    title: `${model.title} ${model.docNumber}`,
    path: getBillingDocumentPrintPath(model),
  })
}

export function closeBillingDocumentPrintWindow(win) {
  try {
    if (win && !win.closed) win.close()
  } catch {
    /* ignore */
  }
}

/** @deprecated Use openBillingDocumentPrintWindow + fillBillingDocumentPrintWindow */
export function openBillingDocumentPrint(model) {
  const opened = openBillingDocumentPrintWindow()
  if (!opened.ok) return opened
  return fillBillingDocumentPrintWindow(opened.win, model)
}

export function buildMailtoForBillingDocument(model) {
  const to = model.client.email?.trim()
  if (!to) {
    return { ok: false, message: 'This client has no email address on file.' }
  }
  const subject = encodeURIComponent(`${model.title} ${model.docNumber} — ${model.company.name}`)
  const body = encodeURIComponent(
    `${buildBillingDocumentPlainText(model)}\n\n—\n${model.company.name}\n${model.company.email}`,
  )
  return { ok: true, href: `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}` }
}

export function prepareBillingDocumentBundle({ type, doc, client, settings, productsById }) {
  const model = buildBillingDocumentModel({ type, doc, client, settings, productsById })
  return {
    model,
    printPageHtml: buildBillingDocumentPrintPage(model),
    emailHtml: buildBillingDocumentEmailHtml(model),
    plainText: buildBillingDocumentPlainText(model),
  }
}
