import { COMPANY } from '../data/site'
import { documentLetterheadFromSettings } from './companyDocumentSettings'
import { DEFAULT_QUOTATION_TERMS } from './quotationTerms'
import { currencyDisplayLabel, formatDocMoney } from './money'

export { formatDocMoney } from './money'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDocDate(isoDate) {
  if (!isoDate) return '—'
  const parts = String(isoDate).slice(0, 10).split('-')
  if (parts.length !== 3) return isoDate
  return `${parts[0]}/${parts[1]}/${parts[2]}`
}

function clientAddress(client) {
  return (
    client?.physical_address ||
    client?.address ||
    client?.postal_address ||
    ''
  ).trim()
}

function documentTitle(type) {
  if (type === 'quote') return 'Estimate'
  return 'Invoice'
}

function documentNumberLabel(type) {
  if (type === 'quote') return 'Estimate #'
  return 'Invoice #'
}

const DEFAULT_PUBLIC_ORIGIN = 'https://www.itreqinc.com'

/** Absolute URL for logo.png (letterhead on print tab + emails). */
export function getBillingDocumentLogoUrl() {
  return resolvePublicAssetUrl('/logo.png')
}

/** Pin icon for table watermark (apple-touch-icon). */
export function getBillingDocumentWatermarkUrl() {
  return resolvePublicAssetUrl('/apple-touch-icon.png')
}

function resolvePublicAssetUrl(path) {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_SITE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (fromEnv) {
    return `${fromEnv}${path}`
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).href
  }
  return `${DEFAULT_PUBLIC_ORIGIN}${path}`
}

/**
 * @param {{ type: 'quote'|'invoice', doc: object, client: object, settings: object|null, productsById?: Record<string, object> }} input
 */
export function buildBillingDocumentModel({ type, doc, client, settings, productsById }) {
  const letterhead = documentLetterheadFromSettings(settings)
  const companyName = settings?.company_name?.trim() || COMPANY.name
  const currency = settings?.currency?.trim() || 'BWP'
  const taxRate = Number(settings?.default_tax_rate) || 0
  const title = documentTitle(type)
  const docNumber = doc.number || (type === 'quote' ? 'Draft' : 'Draft')
  // Printables never include product SKU — description / qty / prices only.
  const lines = (doc.lines || []).map((line) => {
    let description = String(line.description || '').trim() || 'Item'
    const product = line.product_id ? productsById?.[line.product_id] : null
    if (product?.sku && description === String(product.sku).trim()) {
      description = product.name || description
    }
    return {
      description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total ?? Number(line.quantity) * Number(line.unit_price),
    }
  })

  const phoneDisplay =
    client?.cellphone || client?.phone || client?.landline || ''

  const discount_amount = Number(doc.discount_amount) || 0
  const subtotal = Number(doc.subtotal) || 0
  const netAfterDiscount = Math.round((subtotal - discount_amount) * 100) / 100
  const isPaid = type === 'invoice' && doc.status === 'paid'
  const paidDate = isPaid ? doc.paid_date || '' : ''
  const paidDateFormatted = formatDocDate(paidDate)
  const paidNote = isPaid
    ? `Paid in full${paidDate ? ` on ${paidDateFormatted}` : ''}.`
    : ''

  return {
    type,
    title,
    numberLabel: documentNumberLabel(type),
    docNumber,
    status: doc.status,
    isPaid,
    paidDate,
    paidDateFormatted,
    paidNote,
    issueDate: doc.issue_date || '',
    issueDateFormatted: formatDocDate(doc.issue_date),
    dueDate: doc.due_date || '',
    dueDateFormatted: formatDocDate(doc.due_date),
    notes: doc.notes?.trim() || '',
    /** Same terms list used on print and on-screen (quotes only). */
    quoteTerms: type === 'quote' ? [...DEFAULT_QUOTATION_TERMS] : [],
    subtotal,
    discount_amount,
    netAfterDiscount,
    tax_amount: doc.tax_amount,
    total: doc.total,
    taxRate,
    currency,
    logoUrl: getBillingDocumentLogoUrl(),
    watermarkUrl: getBillingDocumentWatermarkUrl(),
    company: {
      name: companyName,
      addressLines: letterhead.addressLines,
      contactPhone: letterhead.contactPhone,
      email: letterhead.email,
      phone: letterhead.contactPhone,
      bankingLines: letterhead.bankingLines,
    },
    client: {
      name: client?.name || doc.clients?.name || 'Client',
      email: client?.email || '',
      phone: phoneDisplay,
      address: clientAddress(client),
    },
    lines,
  }
}

const PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 10mm 11mm;
  }
  * { box-sizing: border-box; }
  html {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
  }
  .doc {
    max-width: 186mm;
    margin: 0 auto;
    padding: 28px 36px 40px;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 48px);
    position: relative;
  }
  .doc-top {
    flex-shrink: 0;
  }
  .lines-stage {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 120px;
    margin-bottom: 0;
    position: relative;
  }
  .lines-stage-inner {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: inherit;
  }
  .lines-watermark {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    height: 100%;
    width: auto;
    max-width: 92%;
    transform: translateX(-50%);
    object-fit: contain;
    object-position: center center;
    opacity: 0.18;
    mix-blend-mode: screen;
    pointer-events: none;
    z-index: 0;
    user-select: none;
  }
  .doc-summary {
    flex-shrink: 0;
    margin-top: auto;
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

  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 18px;
  }
  .letterhead-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .letterhead-logo {
    width: auto;
    max-width: 260px;
    height: auto;
    max-height: 80px;
    object-fit: contain;
    display: block;
  }
  .letterhead-meta {
    font-size: 10pt;
    line-height: 1.45;
    margin: 0;
  }
  .doc-type {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 36pt;
    font-weight: 700;
    text-align: right;
    margin: 0 0 8px;
    line-height: 1;
  }
  .paid-stamp {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 5;
    transform: translate(-50%, -50%) rotate(-45deg);
    margin: 0;
    padding: 10px 28px;
    border: 3px solid #0a7a32;
    color: #0a7a32;
    background: transparent;
    font-size: 28pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.25;
    white-space: nowrap;
    opacity: 0.72;
    pointer-events: none;
    user-select: none;
  }
  .paid-stamp small {
    display: block;
    font-size: 12pt;
    letter-spacing: 0.04em;
    font-weight: 700;
    margin-top: 2px;
  }
  .doc-head-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .meta-table {
    border-collapse: collapse;
    margin-left: auto;
    font-size: 10pt;
  }
  .meta-table td {
    border: 1px solid #000;
    padding: 4px 10px;
  }
  .meta-table td:first-child {
    font-weight: 700;
    white-space: nowrap;
  }
  .meta-table tr.paid-row td {
    font-weight: 700;
    color: #0a7a32;
  }
  .paid-footer {
    margin-top: 12px;
    text-align: right;
    font-size: 11pt;
    font-weight: 700;
    color: #0a7a32;
  }

  .party-row {
    display: flex;
    gap: 0;
    margin-bottom: 0;
    align-items: stretch;
  }
  .party-box {
    border: 1px solid #000;
    flex: 1;
    min-height: 88px;
  }
  .party-box.narrow {
    flex: 0 0 32%;
    max-width: 32%;
    border-left: none;
  }
  .party-box .label {
    border-bottom: 1px solid #000;
    padding: 5px 8px;
    font-weight: 700;
    font-size: 10pt;
    background: #fff;
  }
  .party-box .body {
    padding: 8px 10px;
    font-size: 10pt;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  table.grid {
    width: 100%;
    border-collapse: collapse;
    margin: 0;
    font-size: 10pt;
  }
  table.grid th,
  table.grid td {
    border: 1px solid #000;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.grid th {
    font-weight: 700;
    text-align: center;
    background: #fff;
  }
  table.grid td.num {
    text-align: right;
    white-space: nowrap;
  }
  table.grid.lines-table {
    flex: 1 1 auto;
    height: 100%;
    min-height: 100%;
    border: 1px solid #000;
    position: relative;
    z-index: 1;
    background: transparent;
  }
  table.grid.lines-table thead th {
    background: rgba(255, 255, 255, 0.92);
  }
  table.grid.lines-table tbody tr.line-item td,
  table.grid.lines-table tbody tr.lines-filler td {
    background: transparent;
  }
  table.grid.lines-table th,
  table.grid.lines-table td {
    border: none;
  }
  table.grid.lines-table thead th {
    border-bottom: 1px solid #000;
  }
  table.grid.lines-table thead th + th {
    border-left: 1px solid #000;
  }
  table.grid.lines-table tbody tr.line-item td {
    border-top: none;
    border-bottom: none;
    padding: 6px 8px;
    vertical-align: top;
  }
  table.grid.lines-table tbody tr.line-item td + td {
    border-left: 1px solid #000;
  }
  table.grid.lines-table tbody tr.lines-filler td {
    border: none;
    padding: 0;
    height: 100%;
    min-height: 48mm;
    vertical-align: top;
  }
  table.grid.lines-table tbody tr.lines-filler td + td {
    border-left: 1px solid #000;
  }
  table.grid.lines-table thead {
    display: table-header-group;
  }
  table.grid.lines-table tbody.lines-body {
    height: 100%;
  }
  table.grid.lines-table tbody.lines-body tr.line-item {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table.grid.lines-table tbody.lines-body tr.lines-filler {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table.grid .desc-col {
    width: 52%;
  }
  table.grid .qty-col {
    width: 10%;
  }
  table.grid .rate-col {
    width: 19%;
  }
  table.grid .total-col {
    width: 19%;
  }

  .vat-block {
    margin-top: -1px;
  }
  .vat-block td.label-cell {
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
  }

  .foot-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0;
    margin-top: 14px;
  }
  .bank-box {
    border: 1px solid #000;
    padding: 10px 12px;
    font-size: 9pt;
    line-height: 1.5;
    flex: 1;
    max-width: 55%;
  }
  .totals-box {
    border: 1px solid #000;
    min-width: 260px;
    font-size: 10pt;
  }
  .totals-box table {
    width: 100%;
    border-collapse: collapse;
  }
  .totals-box td {
    padding: 6px 12px;
    border-bottom: 1px solid #000;
  }
  .totals-box td:last-child {
    text-align: right;
    white-space: nowrap;
  }
  .totals-box tr:last-child td {
    border-bottom: none;
    font-size: 18pt;
    font-weight: 700;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .doc-footer {
    text-align: center;
    margin-top: 28px;
    font-size: 10pt;
    font-weight: 700;
  }
  .quote-terms {
    margin-top: 18px;
    text-align: left;
    font-size: 8.5pt;
    line-height: 1.45;
    font-weight: 400;
  }
  .quote-terms-title {
    margin: 0 0 6px;
    font-size: 9pt;
    font-weight: 700;
  }
  .quote-terms ol {
    margin: 0;
    padding-left: 1.25em;
  }
  .quote-terms li {
    margin-bottom: 3px;
  }

  .doc-summary {
    break-inside: avoid-page;
    page-break-inside: avoid;
    flex-shrink: 0;
    margin-top: auto;
  }

  @media print {
    .no-print,
    .toolbar,
    .toolbar button,
    .print-hint {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      border: none !important;
    }
    html, body {
      width: auto;
      height: auto;
      margin: 0;
      padding: 0;
    }
    body {
      font-size: 10pt;
    }
    .doc {
      padding: 0;
      max-width: none;
      width: 100%;
      min-height: 277mm;
      position: relative;
    }
    .paid-stamp {
      opacity: 0.65;
    }
    .lines-stage {
      flex: 1 1 auto;
      min-height: 0;
    }
    table.grid.lines-table tbody tr.lines-filler td {
      min-height: 0;
    }
    .head {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .party-row {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.grid.lines-table {
      break-inside: auto;
      page-break-inside: auto;
    }
    table.grid.lines-table thead {
      display: table-header-group;
    }
    .doc-type {
      font-size: 28pt;
    }
    .letterhead-logo {
      max-width: 200px;
      max-height: 56px;
    }
    .party-box {
      min-height: 0;
    }
    .doc-summary {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .foot-row {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .totals-box tr:last-child td {
      font-size: 14pt;
    }
    .doc-footer {
      margin-top: 10px;
    }
    .foot-row {
      margin-top: 8px;
    }
  }
`

/** Cosmetic path so the print tab (and PDF footer) is not "about:blank". */
export function getBillingDocumentPrintPath(model) {
  const slug = String(model.docNumber || 'draft')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
  const kind = model.type === 'quote' ? 'estimate' : 'invoice'
  return `/admin/print/${kind}/${slug || 'draft'}`
}

function renderDocumentBody(model) {
  const lineRows = model.lines
    .map(
      (line) => `
    <tr class="line-item">
      <td class="desc-col">${escapeHtml(line.description)}</td>
      <td class="num qty-col">${escapeHtml(line.quantity)}</td>
      <td class="num rate-col">${escapeHtml(formatDocMoney(line.unit_price, model.currency))}</td>
      <td class="num total-col">${escapeHtml(formatDocMoney(line.line_total, model.currency))}</td>
    </tr>`,
    )
    .join('')

  const linesBody =
    (lineRows || '<tr class="line-item"><td colspan="4">No line items</td></tr>') +
    `
    <tr class="lines-filler" aria-hidden="true">
      <td class="desc-col"></td>
      <td class="qty-col"></td>
      <td class="rate-col"></td>
      <td class="total-col"></td>
    </tr>`

  const clientBody = [
    model.client.name,
    model.client.address,
    model.client.phone,
    model.client.email,
  ]
    .filter(Boolean)
    .join('\n')

  const addressLines = model.company.addressLines
    .map((l) => escapeHtml(l))
    .join('<br/>')

  const letterheadContact = [
    addressLines,
    model.company.contactPhone
      ? `Contact: ${escapeHtml(model.company.contactPhone)}`
      : '',
    model.company.email ? escapeHtml(model.company.email) : '',
  ]
    .filter(Boolean)
    .join('<br/>')

  const banking = model.company.bankingLines.map((l) => escapeHtml(l)).join('<br/>')

  const currencyLabel = currencyDisplayLabel(model.currency)

  const dueMetaRow =
    model.type === 'invoice' && model.dueDate && !model.isPaid
      ? `<tr><td>Due date</td><td>${escapeHtml(model.dueDateFormatted)}</td></tr>`
      : ''

  const paidMetaRows = model.isPaid
    ? `<tr class="paid-row"><td>Status</td><td>Paid</td></tr>
       <tr class="paid-row"><td>Paid date</td><td>${escapeHtml(model.paidDateFormatted)}</td></tr>`
    : ''

  const paidStamp = model.isPaid
    ? `<div class="paid-stamp" aria-hidden="true">Paid${
        model.paidDate
          ? `<small>${escapeHtml(model.paidDateFormatted)}</small>`
          : ''
      }</div>`
    : ''

  const paidFooter = model.paidNote
    ? `<p class="paid-footer">${escapeHtml(model.paidNote)}</p>`
    : ''

  const projectBody = model.notes ? escapeHtml(model.notes) : '&nbsp;'

  const terms = model.quoteTerms || []
  const quoteTermsHtml =
    model.type === 'quote' && terms.length
      ? `
      <div class="quote-terms">
        <p class="quote-terms-title">Terms</p>
        <ol>
          ${terms.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}
        </ol>
      </div>`
      : ''

  return `
    <div class="doc">
      ${paidStamp}
      <div class="doc-top">
      <header class="head">
        <div class="letterhead">
          <div class="letterhead-row">
            <img
              class="letterhead-logo"
              src="${escapeHtml(model.logoUrl)}"
              alt="${escapeHtml(model.company.name)}"
            />
            <p class="letterhead-meta">
              ${letterheadContact || '—'}
            </p>
          </div>
        </div>
        <div class="doc-head-right">
          <p class="doc-type">${escapeHtml(model.title)}</p>
          <table class="meta-table">
            <tr><td>Date</td><td>${escapeHtml(model.issueDateFormatted)}</td></tr>
            <tr><td>${escapeHtml(model.numberLabel)}</td><td>${escapeHtml(model.docNumber)}</td></tr>
            ${dueMetaRow}
            ${paidMetaRows}
          </table>
        </div>
      </header>

      <div class="party-row">
        <div class="party-box">
          <div class="label">Name / Address</div>
          <div class="body">${escapeHtml(clientBody) || '—'}</div>
        </div>
        <div class="party-box narrow">
          <div class="label">${model.type === 'quote' ? 'Project' : 'Reference'}</div>
          <div class="body">${projectBody}</div>
        </div>
      </div>
      </div>

      <div class="lines-stage">
      <div class="lines-stage-inner">
        <img
          class="lines-watermark"
          src="${escapeHtml(model.watermarkUrl)}"
          alt=""
        />
      <table class="grid lines-table">
        <thead>
          <tr>
            <th class="desc-col">Description</th>
            <th class="qty-col">Qty</th>
            <th class="rate-col">Rate</th>
            <th class="total-col">Total</th>
          </tr>
        </thead>
        <tbody class="lines-body">
          ${linesBody}
        </tbody>
      </table>
      </div>
      </div>

      <div class="doc-summary">
      <table class="grid vat-block">
        <tr>
          <td rowspan="2" class="label-cell desc-col" style="width:52%">VAT Summary</td>
          <th class="qty-col">Rate</th>
          <th class="rate-col">${escapeHtml(currencyLabel)} VAT</th>
          <th class="total-col">${escapeHtml(currencyLabel)} NET</th>
        </tr>
        <tr>
          <td class="num qty-col">${escapeHtml(model.taxRate)}%</td>
          <td class="num rate-col">${escapeHtml(formatDocMoney(model.tax_amount, model.currency))}</td>
          <td class="num total-col">${escapeHtml(formatDocMoney(model.netAfterDiscount, model.currency))}</td>
        </tr>
      </table>

      <div class="foot-row">
        <div class="bank-box">${banking}</div>
        <div class="totals-box">
          <table>
            <tr>
              <td>Subtotal</td>
              <td>${escapeHtml(formatDocMoney(model.subtotal, model.currency))}</td>
            </tr>
            ${
              model.discount_amount > 0
                ? `<tr>
              <td>Discount</td>
              <td>−${escapeHtml(formatDocMoney(model.discount_amount, model.currency))}</td>
            </tr>`
                : ''
            }
            <tr>
              <td>VAT Total</td>
              <td>${escapeHtml(formatDocMoney(model.tax_amount, model.currency))}</td>
            </tr>
            <tr>
              <td>Total</td>
              <td>${escapeHtml(formatDocMoney(model.total, model.currency))}</td>
            </tr>
          </table>
        </div>
      </div>

      ${paidFooter}
      ${quoteTermsHtml}
      </div>
    </div>`
}

/** Full HTML page for print preview (includes toolbar). */
export function buildBillingDocumentPrintPage(model) {
  const body = renderDocumentBody(model)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)} ${escapeHtml(model.docNumber)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="toolbar no-print">
    <p class="print-hint no-print">
      Sized for <strong>A4</strong>; long documents continue on further pages. In the print
      dialog, turn off <strong>Headers and footers</strong> for a clean PDF.
    </p>
    <button type="button" class="primary no-print" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" class="no-print" onclick="window.close()">Close</button>
  </div>
  ${body}
  <script>
    document.title = ${JSON.stringify(`${model.title} ${model.docNumber}`)};
  </script>
</body>
</html>`
}

/** Email-safe fragment (no scripts). */
export function buildBillingDocumentEmailHtml(model) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><style>${PRINT_STYLES} .toolbar { display: none; }</style></head>
<body>${renderDocumentBody(model)}</body>
</html>`
}

export function buildBillingDocumentPlainText(model) {
  const lines = model.lines
    .map(
      (l) =>
        `${l.description}\t${l.quantity}\t${formatDocMoney(l.unit_price, model.currency)}\t${formatDocMoney(l.line_total, model.currency)}`,
    )
    .join('\n')
  return `${model.title} ${model.docNumber}
Date: ${model.issueDateFormatted}
${model.isPaid ? `Status: Paid\nPaid date: ${model.paidDateFormatted}\n` : model.dueDate ? `Due: ${model.dueDateFormatted}\n` : ''}
${model.company.name}
${model.company.addressLines.join('\n')}

Bill to:
${model.client.name}
${model.client.address || ''}

Description\tQty\tRate\tTotal
${lines}

Subtotal: ${formatDocMoney(model.subtotal, model.currency)}
${model.discount_amount > 0 ? `Discount: −${formatDocMoney(model.discount_amount, model.currency)}\n` : ''}VAT: ${formatDocMoney(model.tax_amount, model.currency)}
Total: ${formatDocMoney(model.total, model.currency)}
${model.paidNote ? `\n${model.paidNote}` : ''}${model.notes ? `\nNotes:\n${model.notes}` : ''}${
    model.type === 'quote' && (model.quoteTerms || []).length
      ? `\n\nTerms:\n${model.quoteTerms.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : ''
  }${
    (model.company.bankingLines || []).length
      ? `\n\n${model.company.bankingLines.join('\n')}`
      : ''
  }`
}
