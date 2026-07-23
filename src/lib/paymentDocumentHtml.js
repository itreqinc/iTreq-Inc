import { COMPANY } from '../data/site'
import { documentLetterheadFromSettings } from './companyDocumentSettings'
import { formatDocMoney } from './money'
import { paymentMethodLabel } from './payments'
import {
  getBillingDocumentLogoUrl,
  getBillingDocumentWatermarkUrl,
} from './billingDocumentHtml'

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

/**
 * @param {{ payment: object, client: object, settings: object|null }} input
 */
export function buildPaymentDocumentModel({ payment, client, settings }) {
  const letterhead = documentLetterheadFromSettings(settings)
  const companyName = settings?.company_name?.trim() || COMPANY.name
  const currency = settings?.currency?.trim() || 'BWP'
  const amount = Number(payment.amount) || 0
  const allocations = (payment.allocations || [])
    .filter((a) => Number(a.amount) > 0)
    .map((a) => {
      const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices
      return {
        invoiceNumber: inv?.number || 'Invoice',
        amount: Number(a.amount) || 0,
      }
    })
  const allocatedTotal = Math.round(
    allocations.reduce((sum, a) => sum + a.amount, 0) * 100,
  ) / 100
  const unallocated = Math.round((amount - allocatedTotal) * 100) / 100
  const reference = payment.reference?.trim() || ''
  const shortId = String(payment.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()

  const phoneDisplay =
    client?.cellphone || client?.phone || client?.landline || ''

  return {
    type: 'payment',
    title: 'Payment Receipt',
    docNumber: reference || shortId || 'Receipt',
    numberLabel: reference ? 'Reference' : 'Receipt #',
    paymentDate: payment.payment_date || '',
    paymentDateFormatted: formatDocDate(payment.payment_date),
    method: payment.method || '',
    methodLabel: paymentMethodLabel(payment.method),
    reference,
    notes: payment.notes?.trim() || '',
    amount,
    allocatedTotal,
    unallocated: unallocated > 0.001 ? unallocated : 0,
    allocations,
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
      name: client?.name || payment.clients?.name || 'Client',
      email: client?.email || '',
      phone: phoneDisplay,
      address: clientAddress(client),
    },
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
    max-width: 182mm;
    margin: 0 auto;
    padding: 8px 0 24px;
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    position: relative;
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
  .toolbar {
    max-width: 182mm;
    margin: 0 auto;
    padding: 12px 0 0;
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
    margin-bottom: 22px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(0,0,0,0.18);
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
  .doc-head-right {
    text-align: right;
    flex-shrink: 0;
  }
  .doc-type {
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 10px;
    line-height: 1.15;
  }
  .meta-table {
    border-collapse: collapse;
    margin-left: auto;
    font-size: 10pt;
  }
  .meta-table td {
    padding: 2px 0 2px 16px;
    text-align: left;
  }
  .meta-table td:first-child {
    color: #444;
    padding-left: 0;
    text-align: right;
    white-space: nowrap;
  }
  .party-row {
    display: flex;
    gap: 16px;
    margin-bottom: 18px;
  }
  .party-box {
    flex: 1;
    border: 1px solid rgba(0,0,0,0.18);
    padding: 10px 12px;
    min-height: 72px;
  }
  .party-box .label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #555;
    margin-bottom: 6px;
  }
  .party-box .body {
    white-space: pre-line;
    line-height: 1.45;
  }
  .amount-hero {
    margin: 8px 0 18px;
    padding: 14px 16px;
    border: 1px solid rgba(0,0,0,0.2);
    background: #f7f7f7;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
  }
  .amount-hero .label {
    font-size: 10pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .amount-hero .value {
    font-size: 16pt;
    font-weight: 700;
  }
  table.alloc {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin-bottom: 14px;
    position: relative;
    z-index: 1;
  }
  table.alloc th {
    text-align: left;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid rgba(0,0,0,0.2);
    padding: 8px 8px 8px 0;
  }
  table.alloc th.num,
  table.alloc td.num {
    text-align: right;
    white-space: nowrap;
    padding-right: 0;
  }
  table.alloc td {
    padding: 8px 8px 8px 0;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    vertical-align: top;
  }
  .totals {
    margin-left: auto;
    width: 240px;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .totals td {
    padding: 4px 0;
  }
  .totals td:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .totals tr.strong td {
    font-weight: 700;
    border-top: 1px solid rgba(0,0,0,0.2);
    padding-top: 8px;
  }
  .notes {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid rgba(0,0,0,0.12);
    font-size: 10pt;
    line-height: 1.45;
    white-space: pre-line;
  }
  .notes .label {
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #555;
    margin-bottom: 6px;
  }
  .thanks {
    margin-top: auto;
    padding-top: 28px;
    font-size: 10pt;
    color: #333;
  }
  @media print {
    .toolbar, .no-print { display: none !important; }
    .doc { padding: 0; }
  }
`

function renderPaymentBody(model) {
  const addressLines = model.company.addressLines.map((l) => escapeHtml(l)).join('<br/>')
  const letterheadContact = [
    addressLines,
    model.company.contactPhone
      ? `Contact: ${escapeHtml(model.company.contactPhone)}`
      : '',
    model.company.email ? escapeHtml(model.company.email) : '',
  ]
    .filter(Boolean)
    .join('<br/>')

  const clientBody = [
    model.client.name,
    model.client.address,
    model.client.phone,
    model.client.email,
  ]
    .filter(Boolean)
    .join('\n')

  const allocRows =
    model.allocations.length === 0
      ? `<tr><td colspan="2" style="color:#666">No invoices allocated — full amount credited to account.</td></tr>`
      : model.allocations
          .map(
            (a) => `
    <tr>
      <td>Invoice ${escapeHtml(a.invoiceNumber)}</td>
      <td class="num">${escapeHtml(formatDocMoney(a.amount, model.currency))}</td>
    </tr>`,
          )
          .join('')

  return `
    <div class="doc">
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
            <tr><td>Date</td><td>${escapeHtml(model.paymentDateFormatted)}</td></tr>
            <tr><td>${escapeHtml(model.numberLabel)}</td><td>${escapeHtml(model.docNumber)}</td></tr>
            <tr><td>Method</td><td>${escapeHtml(model.methodLabel)}</td></tr>
          </table>
        </div>
      </header>

      <div class="party-row">
        <div class="party-box">
          <div class="label">Received from</div>
          <div class="body">${escapeHtml(clientBody) || '—'}</div>
        </div>
      </div>

      <div class="amount-hero">
        <span class="label">Amount received</span>
        <span class="value">${escapeHtml(formatDocMoney(model.amount, model.currency))}</span>
      </div>

      <div class="lines-stage">
      <div class="lines-stage-inner">
        <img
          class="lines-watermark"
          src="${escapeHtml(model.watermarkUrl)}"
          alt=""
        />
      <table class="alloc">
        <thead>
          <tr>
            <th>Applied to</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${allocRows}
        </tbody>
      </table>
      </div>
      </div>

      <table class="totals">
        <tr>
          <td>Allocated</td>
          <td>${escapeHtml(formatDocMoney(model.allocatedTotal, model.currency))}</td>
        </tr>
        ${
          model.unallocated > 0
            ? `<tr>
          <td>Account credit</td>
          <td>${escapeHtml(formatDocMoney(model.unallocated, model.currency))}</td>
        </tr>`
            : ''
        }
        <tr class="strong">
          <td>Total received</td>
          <td>${escapeHtml(formatDocMoney(model.amount, model.currency))}</td>
        </tr>
      </table>

      ${
        model.notes
          ? `<div class="notes"><div class="label">Notes</div>${escapeHtml(model.notes)}</div>`
          : ''
      }

      <p class="thanks">Thank you for your payment.</p>
    </div>`
}

export function getPaymentDocumentPrintPath(model) {
  const slug = String(model.docNumber || 'receipt')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
  return `/print/payment-receipt/${slug || 'receipt'}`
}

export function buildPaymentDocumentPrintPage(model) {
  const body = renderPaymentBody(model)
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
      Sized for <strong>A4</strong>. In the print dialog, turn off
      <strong>Headers and footers</strong> for a clean PDF.
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

export function buildPaymentDocumentEmailHtml(model) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><style>${PRINT_STYLES} .toolbar { display: none; }</style></head>
<body>${renderPaymentBody(model)}</body>
</html>`
}

export function buildPaymentDocumentPlainText(model) {
  const allocLines = model.allocations.length
    ? model.allocations
        .map((a) => `Invoice ${a.invoiceNumber}\t${formatDocMoney(a.amount, model.currency)}`)
        .join('\n')
    : 'No invoices allocated — full amount credited to account.'

  return `${model.title} ${model.docNumber}
Date: ${model.paymentDateFormatted}
Method: ${model.methodLabel}
${model.reference ? `Reference: ${model.reference}\n` : ''}
${model.company.name}

Received from:
${model.client.name}
${model.client.address || ''}

Amount received: ${formatDocMoney(model.amount, model.currency)}

Applied to:
${allocLines}

Allocated: ${formatDocMoney(model.allocatedTotal, model.currency)}
${model.unallocated > 0 ? `Account credit: ${formatDocMoney(model.unallocated, model.currency)}\n` : ''}Total received: ${formatDocMoney(model.amount, model.currency)}
${model.notes ? `\nNotes:\n${model.notes}` : ''}

Thank you for your payment.`
}
