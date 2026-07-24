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
 *   includeZeroMethods?: boolean,
 * }} input
 */
export function buildIncomeMethodReportModel({
  report,
  settings,
  includeZeroMethods = false,
}) {
  const letterhead = documentLetterheadFromSettings(settings)
  const companyName = settings?.company_name?.trim() || COMPANY.name
  const currency = settings?.currency?.trim() || 'BWP'
  const source = report?.methodTotals || report?.byMethod || []
  const methods = (includeZeroMethods ? source : source.filter((row) => Number(row.amount) > 0)).map(
    (row) => ({
      method: row.method,
      label: row.label || row.method,
      amount: Number(row.amount) || 0,
    }),
  )
  const total = Math.round((Number(report?.total) || 0) * 100) / 100

  return {
    title: 'Income by method',
    from: report?.from || '',
    to: report?.to || '',
    fromFormatted: formatDocDate(report?.from),
    toFormatted: formatDocDate(report?.to),
    paymentCount: Number(report?.paymentCount) || 0,
    includeZeroMethods: Boolean(includeZeroMethods),
    currency,
    total,
    logoUrl: getBillingDocumentLogoUrl(),
    company: {
      name: companyName,
      addressLines: letterhead.addressLines,
      contactPhone: letterhead.contactPhone,
      email: letterhead.email,
    },
    methods,
  }
}

export function getIncomeMethodReportPrintPath(model) {
  const period = [model.from, model.to].filter(Boolean).join('_') || 'period'
  return `/admin/print/income-by-method/${period}`
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
    margin-bottom: 22px;
    padding-bottom: 14px;
    border-bottom: 1px solid rgba(0,0,0,0.18);
  }
  .head-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }
  .logo-slot {
    height: 80px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
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
    margin: 8px 0 0;
  }
  .doc-meta {
    flex: 0 1 42%;
    max-width: 16rem;
    text-align: right;
    padding-top: calc((80px - 19.2px) / 2);
  }
  .doc-meta h1 {
    font-size: 16pt;
    font-weight: 700;
    margin: 0 0 8px;
    line-height: 1.2;
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
  .totals-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    border-top: 2px solid #000;
  }
  .totals-table td {
    padding: 10px 6px 0;
    font-weight: 700;
  }
  .totals-table td.num {
    text-align: right;
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
      /* Stay within A4 printable height (297mm − 12mm − 18mm margins). */
      min-height: 260mm;
    }
    .head,
    .doc-footer {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`

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
  const filterNote = model.includeZeroMethods
    ? 'Includes all payment methods (including those with no receipts in this period).'
    : 'Includes only payment methods with receipts greater than zero in this period.'

  const rows =
    model.methods.length === 0
      ? `<tr><td colspan="2">No payment methods to show for this period.</td></tr>`
      : model.methods
          .map(
            (row) => `<tr>
          <td>${escapeHtml(row.label)}</td>
          <td class="num">${escapeHtml(formatDocMoney(row.amount, model.currency))}</td>
        </tr>`,
          )
          .join('')

  return `
    <div class="doc">
      <div class="doc-top">
        <div class="head">
          <div class="head-top">
            <div class="logo-slot">
              <img class="letterhead-logo" src="${escapeHtml(model.logoUrl)}" alt="${escapeHtml(model.company.name)}" />
            </div>
            <div class="doc-meta">
              <h1>${escapeHtml(model.title)}</h1>
              <p><strong>Period:</strong> ${escapeHtml(model.fromFormatted)} to ${escapeHtml(model.toFormatted)}</p>
              <p><strong>Payments recorded:</strong> ${escapeHtml(String(model.paymentCount))}</p>
            </div>
          </div>
          <div class="letterhead-meta">
            ${address ? `${address}<br />` : ''}
            ${phone}
            ${email}
          </div>
        </div>
      </div>

      <div class="lines-wrap">
        <table class="report">
          <thead>
            <tr>
              <th>Method</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="doc-footer">
        <table class="totals-table">
          <tr>
            <td>Total</td>
            <td class="num">${escapeHtml(formatDocMoney(model.total, model.currency))}</td>
          </tr>
        </table>
        <p class="note">${escapeHtml(filterNote)}</p>
      </div>
    </div>`
}

export function buildIncomeMethodReportPrintPage(model) {
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
