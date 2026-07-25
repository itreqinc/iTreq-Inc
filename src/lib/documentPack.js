import {
  PRINT_STYLES as BILLING_PRINT_STYLES,
  renderDocumentBody,
} from './billingDocumentHtml'
import {
  PRINT_STYLES as STATEMENT_PRINT_STYLES,
  renderStatementBody,
} from './statementDocumentHtml'
import { fillPrintWindowWithHtml } from './billingDocument'

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
}

/** Read `{ ... }` starting at `openIndex` (must point at `{`). */
function readCssBlock(css, openIndex) {
  let depth = 0
  for (let i = openIndex; i < css.length; i += 1) {
    const ch = css[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return {
          content: css.slice(openIndex + 1, i),
          end: i,
        }
      }
    }
  }
  return { content: css.slice(openIndex + 1), end: css.length - 1 }
}

function scopeSelectorList(selectorGroup, scope) {
  return selectorGroup
    .split(',')
    .map((raw) => {
      const sel = raw.trim()
      if (!sel) return sel
      if (sel === 'html' || sel === 'body') return scope
      if (sel.startsWith('html ') || sel.startsWith('body ')) {
        return `${scope}${sel.slice(sel.indexOf(' '))}`
      }
      if (sel.startsWith(':root')) return `${scope}${sel.slice(5)}`
      return `${scope} ${sel}`
    })
    .join(', ')
}

/**
 * Prefix every selector with `scope` so statement + invoice stylesheets can
 * coexist. Handles nested @media blocks. Strips @page (pack sets named pages).
 */
function scopeCss(css, scope) {
  let input = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '')
  input = input.replace(/@page\b[^{]*\{[^}]*\}/g, '')

  function scopeRules(block) {
    let out = ''
    let i = 0
    const text = block

    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) {
        out += text[i]
        i += 1
      }
      if (i >= text.length) break

      if (text.startsWith('@media', i)) {
        const braceAt = text.indexOf('{', i)
        if (braceAt === -1) break
        const query = text.slice(i, braceAt)
        const { content, end } = readCssBlock(text, braceAt)
        out += `${query}{${scopeRules(content)}}`
        i = end + 1
        continue
      }

      // Skip other at-rules with blocks (keep as-is, rare here).
      if (text[i] === '@') {
        const braceAt = text.indexOf('{', i)
        const semiAt = text.indexOf(';', i)
        if (braceAt !== -1 && (semiAt === -1 || braceAt < semiAt)) {
          const prelude = text.slice(i, braceAt)
          const { content, end } = readCssBlock(text, braceAt)
          out += `${prelude}{${content}}`
          i = end + 1
        } else if (semiAt !== -1) {
          out += text.slice(i, semiAt + 1)
          i = semiAt + 1
        } else {
          break
        }
        continue
      }

      const braceAt = text.indexOf('{', i)
      if (braceAt === -1) {
        out += text.slice(i)
        break
      }
      const selectors = text.slice(i, braceAt)
      const { content, end } = readCssBlock(text, braceAt)
      out += `${scopeSelectorList(selectors, scope)}{${content}}`
      i = end + 1
    }

    return out
  }

  return scopeRules(input)
}

/**
 * Statement followed by open invoices — each uses the same body markup and
 * stylesheet as the standalone Print / Save PDF view.
 */
export function buildDocumentPackPrintPage({ statementModel, invoiceModels = [] }) {
  const clientName = statementModel?.client?.name || 'Account'
  const title = `Account pack — ${clientName}`

  const statementScope = '.pack-doc--statement'
  const invoiceScope = '.pack-doc--invoice'

  const sections = []

  if (statementModel) {
    sections.push(`
      <section class="pack-doc pack-doc--statement">
        ${renderStatementBody(statementModel)}
      </section>`)
  }

  for (const model of invoiceModels) {
    sections.push(`
      <section class="pack-doc pack-doc--invoice">
        ${renderDocumentBody(model)}
      </section>`)
  }

  const invoiceCount = invoiceModels.length
  const summary =
    invoiceCount === 0
      ? 'Your statement. You have no unpaid invoices.'
      : `Your statement plus ${invoiceCount} unpaid invoice${invoiceCount === 1 ? '' : 's'}.`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* Same page boxes as the standalone Print / Save PDF views. */
    @page statement {
      size: A4 portrait;
      margin: 12mm 14mm;
    }
    @page invoice {
      size: A4 portrait;
      margin: 10mm 11mm;
    }
    @page {
      size: A4 portrait;
      margin: 12mm 14mm;
    }

    html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
    }

    .pack-doc {
      page-break-after: always;
      break-after: page;
    }
    .pack-doc:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .pack-doc--statement {
      page: statement;
    }
    .pack-doc--invoice {
      page: invoice;
    }

    /*
      Standalone print views size one document to the viewport / page.
      In a pack that leaves large blank gaps between docs on screen — keep
      print min-heights from each document's own @media print rules.
    */
    ${statementScope} .doc,
    ${invoiceScope} .doc {
      min-height: 0;
    }

    .toolbar {
      max-width: 186mm;
      margin: 0 auto;
      padding: 12px 36px 0;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      font-family: system-ui, sans-serif;
      font-size: 13px;
    }
    .print-hint {
      flex: 1 1 100%;
      margin: 0 0 8px;
      color: #444;
      line-height: 1.4;
    }
    .toolbar button {
      font: inherit;
      cursor: pointer;
      border-radius: 6px;
      border: 1px solid #999;
      background: #fff;
      padding: 8px 14px;
      font-weight: 600;
    }
    .toolbar button.primary {
      background: #6dc03f;
      border-color: #52992e;
      color: #050608;
    }
    @media print {
      .no-print,
      .toolbar,
      .toolbar button,
      .print-hint {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
      }
    }

    /* Exact statement + invoice print styles, scoped per document type. */
    ${scopeCss(STATEMENT_PRINT_STYLES, statementScope)}
    ${scopeCss(BILLING_PRINT_STYLES, invoiceScope)}
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <p class="print-hint no-print">
      ${escapeHtml(summary)} Each document starts on a new A4 page and uses the same layout as
      Print / Save PDF. In the print dialog, turn off <strong>Headers and footers</strong>
      for a clean PDF.
    </p>
    <button type="button" class="primary no-print" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" class="no-print" onclick="window.close()">Close</button>
  </div>
  ${sections.join('\n')}
  <script>
    document.title = ${JSON.stringify(title)};
  </script>
</body>
</html>`
}

export function fillDocumentPackPrintWindow(win, { statementModel, invoiceModels }) {
  const clientName = statementModel?.client?.name || 'Account'
  return fillPrintWindowWithHtml(win, {
    html: buildDocumentPackPrintPage({ statementModel, invoiceModels }),
    title: `Account pack — ${clientName}`,
    path: '/portal/print/account-pack',
  })
}
