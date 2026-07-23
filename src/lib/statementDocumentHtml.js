import { COMPANY } from '../data/site'
import { documentLetterheadFromSettings } from './companyDocumentSettings'
import { paymentMethodLabel } from './payments'
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
 * @param {{ statement: object, settings: object|null }} input
 */
export function buildStatementDocumentModel({ statement, settings }) {
  const letterhead = documentLetterheadFromSettings(settings)
  const companyName = settings?.company_name?.trim() || COMPANY.name
  const currency = settings?.currency?.trim() || 'BWP'
  const client = statement?.client || {}

  const lines = (statement?.lines || [])
    .filter((line) => !line.inactive)
    .map((line) => {
    const base =
      line.type === 'invoice' ? `Invoice ${line.label}` : `Payment ${line.label}`
    const method = line.method ? ` (${paymentMethodLabel(line.method)})` : ''
    return {
      date: line.sortDate || '',
      dateFormatted: formatDocDate(line.sortDate),
      description: `${base}${method}`,
      debit: line.debit || 0,
      credit: line.credit || 0,
      balance: line.balance,
    }
  })

  return {
    title: 'Account statement',
    from: statement?.from || '',
    to: statement?.to || '',
    fromFormatted: formatDocDate(statement?.from),
    toFormatted: formatDocDate(statement?.to),
    openingBalance: Number(statement?.openingBalance) || 0,
    periodCharges: Number(statement?.periodCharges) || 0,
    periodCredits: Number(statement?.periodCredits) || 0,
    closingBalance: Number(statement?.closingBalance) || 0,
    currency,
    logoUrl: getBillingDocumentLogoUrl(),
    company: {
      name: companyName,
      addressLines: letterhead.addressLines,
      contactPhone: letterhead.contactPhone,
      email: letterhead.email,
    },
    client: {
      name: client.name || 'Client',
    },
    lines,
  }
}

export function getStatementDocumentPrintPath(model) {
  const slug = String(model.client?.name || 'client')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
  const period = [model.from, model.to].filter(Boolean).join('_') || 'period'
  return `/admin/print/statement/${slug || 'client'}/${period}`
}

const PRINT_STYLES = `
  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
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
    display: flex;
    flex-direction: column;
    min-height: 80px;
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

  /* Letterhead — same as invoices/quotations */
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
  .doc-type {
    font-size: 22pt;
    font-weight: 700;
    text-align: right;
    margin: 0;
    line-height: 1.15;
  }

  .intro h1 {
    font-size: 14pt;
    font-weight: 700;
    margin: 0 0 6px;
  }
  .intro p {
    margin: 0 0 4px;
    font-size: 10pt;
    font-weight: 700;
  }
  .intro .opening {
    margin-top: 12px;
    margin-bottom: 0;
  }

  table.stmt {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 14px;
    font-size: 10pt;
  }
  table.stmt thead {
    display: table-header-group;
  }
  table.stmt th {
    text-align: left;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    padding: 8px 8px 8px 0;
    border-bottom: 1px solid rgba(0,0,0,0.2);
  }
  table.stmt th.num,
  table.stmt td.num {
    text-align: right;
    white-space: nowrap;
    padding-right: 0;
  }
  table.stmt td {
    padding: 8px 8px 8px 0;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    vertical-align: top;
  }
  table.stmt tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  col.date-col { width: 16%; }
  col.desc-col { width: 40%; }
  col.debit-col { width: 14.666%; }
  col.credit-col { width: 14.666%; }
  col.bal-col { width: 14.668%; }

  .totals-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10pt;
    border-top: 2px solid #000;
  }
  .totals-table td {
    padding: 10px 8px 10px 0;
    font-weight: 700;
  }
  .totals-table td.num {
    text-align: right;
    white-space: nowrap;
    padding-right: 0;
  }
  .closing {
    margin: 14px 0 0;
    font-size: 12pt;
    font-weight: 700;
  }
  .footer-note {
    margin: 16px 0 0;
    font-size: 9pt;
    line-height: 1.45;
    color: #222;
    max-width: 95%;
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
    .doc {
      padding: 0;
      max-width: none;
      width: 100%;
      min-height: 273mm;
    }
    .head {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .doc-footer {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .letterhead-logo {
      max-width: 200px;
      max-height: 56px;
    }
    table.stmt thead {
      display: table-header-group;
    }
  }
`

function moneyOrDash(amount, currency) {
  const n = Number(amount) || 0
  if (n === 0) return '—'
  return escapeHtml(formatDocMoney(n, currency))
}

function renderStatementBody(model) {
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

  const lineRows =
    model.lines.length === 0
      ? `<tr><td colspan="5" style="color:#777">No activity in this period.</td></tr>`
      : model.lines
          .map(
            (line) => `
    <tr>
      <td>${escapeHtml(line.dateFormatted)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="num">${moneyOrDash(line.debit, model.currency)}</td>
      <td class="num">${moneyOrDash(line.credit, model.currency)}</td>
      <td class="num">${escapeHtml(formatDocMoney(line.balance, model.currency))}</td>
    </tr>`,
          )
          .join('')

  const officeLine = model.company.contactPhone?.trim() || 'our office line'
  const footerNote = `This statement contains all your transactions received and captured by our office. If you find any of your transactions missing, please contact our office on ${officeLine}.`

  return `
    <div class="doc">
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
          <p class="doc-type">${escapeHtml(model.title)}</p>
        </header>

        <div class="intro">
          <p>${escapeHtml(model.client.name)}</p>
          <p>Period: ${escapeHtml(model.fromFormatted)} to ${escapeHtml(model.toFormatted)}</p>
          <p class="opening">Opening balance: ${escapeHtml(formatDocMoney(model.openingBalance, model.currency))}</p>
        </div>
      </div>

      <div class="lines-wrap">
        <table class="stmt">
          <colgroup>
            <col class="date-col" />
            <col class="desc-col" />
            <col class="debit-col" />
            <col class="credit-col" />
            <col class="bal-col" />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th class="num">Debit</th>
              <th class="num">Credit</th>
              <th class="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows}
          </tbody>
        </table>
      </div>

      <div class="doc-footer">
        <table class="totals-table">
          <colgroup>
            <col class="date-col" />
            <col class="desc-col" />
            <col class="debit-col" />
            <col class="credit-col" />
            <col class="bal-col" />
          </colgroup>
          <tr>
            <td colspan="2">Period totals</td>
            <td class="num">${escapeHtml(formatDocMoney(model.periodCharges, model.currency))}</td>
            <td class="num">${escapeHtml(formatDocMoney(model.periodCredits, model.currency))}</td>
            <td class="num">${escapeHtml(formatDocMoney(model.closingBalance, model.currency))}</td>
          </tr>
        </table>
        <p class="closing">Closing balance: ${escapeHtml(formatDocMoney(model.closingBalance, model.currency))}</p>
        <p class="footer-note">${escapeHtml(footerNote)}</p>
      </div>
    </div>`
}

export function buildStatementDocumentPrintPage(model) {
  const body = renderStatementBody(model)
  const pageTitle = `Statement — ${model.client.name}`
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
      Sized for <strong>A4</strong>; long statements continue on further pages with
      totals at the bottom of the last page. Turn off <strong>Headers and footers</strong>
      in the print dialog for a clean PDF.
    </p>
    <button type="button" class="primary no-print" onclick="window.print()">Print / Save as PDF</button>
    <button type="button" class="no-print" onclick="window.close()">Close</button>
  </div>
  ${body}
  <script>
    document.title = ${JSON.stringify(pageTitle)};
  </script>
</body>
</html>`
}
