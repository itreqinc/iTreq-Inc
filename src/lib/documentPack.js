import {
  PRINT_STYLES as BILLING_PRINT_STYLES,
  renderDocumentBody,
} from './billingDocumentHtml'
import {
  PRINT_STYLES as STATEMENT_PRINT_STYLES,
  renderStatementBody,
} from './statementDocumentHtml'
import { fillPrintWindowWithHtml } from './billingDocument'

/**
 * The two document stylesheets share selectors, so the pack loads both and then
 * adds page breaks between documents.
 */
const PACK_STYLES = `
  .pack-doc {
    page-break-after: always;
    break-after: page;
  }
  .pack-doc:last-of-type {
    page-break-after: auto;
    break-after: auto;
  }
  @media print {
    .toolbar { display: none !important; }
  }
`

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  )
}

/**
 * Statement followed by every open invoice, as one printable A4 document.
 */
export function buildDocumentPackPrintPage({ statementModel, invoiceModels = [] }) {
  const clientName = statementModel?.client?.name || 'Account'
  const title = `Account pack — ${clientName}`

  const sections = [
    statementModel
      ? `<div class="pack-doc">${renderStatementBody(statementModel)}</div>`
      : '',
    ...invoiceModels.map(
      (model) => `<div class="pack-doc">${renderDocumentBody(model)}</div>`,
    ),
  ]
    .filter(Boolean)
    .join('\n')

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
  <style>${BILLING_PRINT_STYLES}</style>
  <style>${STATEMENT_PRINT_STYLES}</style>
  <style>${PACK_STYLES}</style>
</head>
<body>
  <div class="toolbar no-print">
    <p class="print-hint no-print">
      ${escapeHtml(summary)} Each document starts on a new A4 page. In the print dialog,
      turn off <strong>Headers and footers</strong> for a clean PDF.
    </p>
    <button type="button" class="primary no-print" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" class="no-print" onclick="window.close()">Close</button>
  </div>
  ${sections}
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
