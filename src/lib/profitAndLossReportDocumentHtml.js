import { COMPANY } from '../data/site'
import { documentLetterheadFromSettings } from './companyDocumentSettings'
import {
  formatDocMoney,
  getBillingDocumentLogoUrl,
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

/**
 * @param {{
 *   report: object,
 *   settings: object|null,
 * }} input
 */
export function buildProfitAndLossReportModel({ report, settings }) {
  const letterhead = documentLetterheadFromSettings(settings)
  const companyName = settings?.company_name?.trim() || COMPANY.name
  const currency = settings?.currency?.trim() || 'BWP'
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100

  const expensesByCategory = (report?.expensesByCategory || []).map((row) => ({
    category: row.category,
    amount: round(row.amount),
  }))

  return {
    title: 'Profit & loss',
    from: report?.from || '',
    to: report?.to || '',
    fromFormatted: formatDocDate(report?.from),
    toFormatted: formatDocDate(report?.to),
    currency,
    revenue: round(report?.revenue),
    paymentCount: Number(report?.paymentCount) || 0,
    stockPurchases: round(report?.stockPurchases),
    purchaseOrderCount: Number(report?.purchaseOrderCount) || 0,
    operatingExpenses: round(report?.operatingExpenses),
    expenseCount: Number(report?.expenseCount) || 0,
    grossProfit: round(report?.grossProfit),
    netProfit: round(report?.netProfit),
    margin: report?.margin,
    expensesByCategory,
    logoUrl: getBillingDocumentLogoUrl(),
    company: {
      name: companyName,
      addressLines: letterhead.addressLines,
      contactPhone: letterhead.contactPhone,
      email: letterhead.email,
    },
  }
}

export function getProfitAndLossReportPrintPath(model) {
  const period = [model.from, model.to].filter(Boolean).join('_') || 'period'
  return `/admin/print/profit-and-loss/${period}`
}

const PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 12mm 14mm 18mm 14mm;

    @bottom-center {
      content: "Page " counter(page);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #333;
    }
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
    padding: 24px 28px 36px;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 40px);
  }
  .doc-top {
    flex-shrink: 0;
  }
  .lines-wrap {
    flex: 1 1 auto;
  }
  .doc-footer {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 16px;
  }
  .toolbar {
    max-width: 182mm;
    margin: 0 auto;
    padding: 12px 28px 0;
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
    gap: 4px;
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
    font-size: 22pt;
    font-weight: 700;
    text-align: right;
    margin: 0 0 8px;
    line-height: 1.15;
  }
  .doc-meta {
    flex: 0 1 42%;
    max-width: 16rem;
    text-align: right;
  }
  .doc-meta p {
    margin: 0 0 4px;
    font-size: 10pt;
    line-height: 1.4;
  }
  .doc-meta p:last-child {
    margin-bottom: 0;
  }
  table.report {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
    font-size: 10pt;
  }
  table.report thead {
    display: table-header-group;
  }
  table.report th {
    text-align: left;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 8px 6px;
    border-bottom: 2px solid #000;
  }
  table.report th.num,
  table.report td.num {
    text-align: right;
  }
  table.report td {
    padding: 8px 6px;
    border-bottom: 1px solid rgba(0,0,0,0.12);
    vertical-align: top;
  }
  table.report tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table.report tr.section td {
    font-weight: 700;
    border-bottom: 1px solid rgba(0,0,0,0.35);
  }
  table.report tr.total td {
    font-weight: 700;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding-top: 10px;
    padding-bottom: 10px;
  }
  table.report tr.indent td:first-child {
    padding-left: 18px;
  }
  .section-title {
    margin: 22px 0 8px;
    font-size: 11pt;
    font-weight: 700;
  }
  .note {
    margin-top: 14px;
    font-size: 9pt;
    color: #444;
  }
  @media print {
    .no-print,
    .toolbar,
    .print-hint {
      display: none !important;
    }
    html, body {
      margin: 0;
      padding: 0;
    }
    .doc {
      padding: 0;
      max-width: none;
      width: 100%;
      min-height: 260mm;
    }
    .head,
    .doc-footer {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`

function money(model, amount) {
  return escapeHtml(formatDocMoney(amount, model.currency))
}

function renderBody(model) {
  const address = (model.company.addressLines || [])
    .map((line) => escapeHtml(line))
    .join('<br />')
  const phone = model.company.contactPhone
    ? `<div>${escapeHtml(model.company.contactPhone)}</div>`
    : ''
  const email = model.company.email
    ? `<div>${escapeHtml(model.company.email)}</div>`
    : ''
  const marginLabel =
    model.margin != null ? `${model.margin}% of revenue` : 'No revenue in this period'

  const categoryRows =
    model.expensesByCategory.length === 0
      ? `<tr><td colspan="2">No operating expenses in this period.</td></tr>`
      : model.expensesByCategory
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.category)}</td>
          <td class="num">${money(model, row.amount)}</td>
        </tr>`,
          )
          .join('')

  return `
    <div class="doc">
      <div class="doc-top">
        <div class="head">
          <div class="letterhead-row">
            <img class="letterhead-logo" src="${escapeHtml(model.logoUrl)}" alt="${escapeHtml(model.company.name)}" />
            <div class="letterhead-meta">
              ${address ? `${address}<br />` : ''}
              ${phone}
              ${email}
            </div>
          </div>
          <div class="doc-meta">
            <h1 class="doc-type">${escapeHtml(model.title)}</h1>
            <p><strong>Period:</strong> ${escapeHtml(model.fromFormatted)} to ${escapeHtml(model.toFormatted)}</p>
            <p><strong>Basis:</strong> Cash (payments &amp; spends dated in range)</p>
          </div>
        </div>
      </div>

      <div class="lines-wrap">
        <table class="report">
          <thead>
            <tr>
              <th>Description</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Revenue (payments received · ${escapeHtml(String(model.paymentCount))})</td>
              <td class="num">${money(model, model.revenue)}</td>
            </tr>
            <tr class="indent">
              <td>Less: stock purchases · ${escapeHtml(String(model.purchaseOrderCount))}</td>
              <td class="num">−${money(model, model.stockPurchases)}</td>
            </tr>
            <tr class="section">
              <td>Gross profit</td>
              <td class="num">${money(model, model.grossProfit)}</td>
            </tr>
            <tr class="indent">
              <td>Less: operating expenses · ${escapeHtml(String(model.expenseCount))}</td>
              <td class="num">−${money(model, model.operatingExpenses)}</td>
            </tr>
            <tr class="total">
              <td>Net profit</td>
              <td class="num">${money(model, model.netProfit)}</td>
            </tr>
          </tbody>
        </table>

        <p class="section-title">Operating expenses by category</p>
        <table class="report">
          <thead>
            <tr>
              <th>Category</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${categoryRows}
          </tbody>
        </table>
      </div>

      <div class="doc-footer">
        <p class="note">
          Margin: ${escapeHtml(marginLabel)}. Stock purchases are counted on the purchase order
          (paid) date, not when stock is sold.
        </p>
      </div>
    </div>`
}

export function buildProfitAndLossReportPrintPage(model) {
  const pageTitle = `${model.title} ${model.fromFormatted}–${model.toFormatted}`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="toolbar no-print">
    <p class="print-hint no-print">
      Sized for <strong>A4</strong>. Keep <strong>Headers and footers</strong> turned
      <strong>off</strong> — page numbers are printed by the report itself.
    </p>
    <button type="button" class="primary no-print" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" class="no-print" onclick="window.close()">Close</button>
  </div>
  ${renderBody(model)}
  <script>
    document.title = ${JSON.stringify(pageTitle)};
  </script>
</body>
</html>`
}
