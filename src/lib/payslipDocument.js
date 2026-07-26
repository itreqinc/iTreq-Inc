import { opsApi } from './opsApi'
import { documentLetterheadFromSettings } from './companyDocumentSettings'
import { getBillingDocumentLogoUrl } from './billingDocumentHtml'
import {
  openBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
  closeBillingDocumentPrintWindow,
} from './billingDocument'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Open a printable, professional salary advice slip.
 * Left letterhead matches quotes/invoices; totals sit at the bottom.
 */
export async function openPayslipPrintWindow(payslip) {
  const opened = openBillingDocumentPrintWindow()
  if (!opened.ok) return false

  try {
    const settingsRes = await opsApi.getSettings()
    const settings = settingsRes.error ? null : settingsRes.data
    const html = buildPayslipHtml(payslip, settings)
    const period =
      payslip?.pay_run?.period_year && payslip?.pay_run?.period_month
        ? `${payslip.pay_run.period_year}-${String(payslip.pay_run.period_month).padStart(2, '0')}`
        : 'payslip'
    const filled = fillPrintWindowWithHtml(opened.win, {
      html,
      title: `Salary advice ${period}`,
      path: `/print/salary-advice/${period}`,
    })
    return filled.ok
  } catch {
    closeBillingDocumentPrintWindow(opened.win)
    return false
  }
}

export function buildPayslipHtml(payslip, settings = null) {
  const snap = payslip?.snapshot || {}
  const run = payslip?.pay_run || {}
  const letterhead = documentLetterheadFromSettings(settings)
  const logoUrl = getBillingDocumentLogoUrl()

  const periodYear = run.period_year ?? snap.period_year
  const periodMonth = run.period_month ?? snap.period_month
  const monthName = MONTHS[(Number(periodMonth) || 1) - 1] || ''
  const periodLabel = periodYear ? `${monthName} ${periodYear}` : '—'
  const payday = String(run.payday || snap.payday || '').slice(0, 10)

  const companyName =
    settings?.company_name?.trim() || snap.company_name || 'iTreq Inc'
  const currency = settings?.currency?.trim() || snap.currency || 'BWP'

  const staffName = snap.staff_name || payslip.staff_name || ''
  const jobTitle = snap.job_title || payslip.job_title || ''
  const email = snap.email || ''
  const phone = snap.phone || ''
  const employeeRef =
    snap.employee_ref || String(payslip.user_id || payslip.id || '').slice(0, 8).toUpperCase()
  const startDate = snap.start_date ? String(snap.start_date).slice(0, 10) : ''
  const status = snap.employment_status || ''
  const bankName = snap.bank_name || ''
  const bankAccount = snap.bank_account || ''
  const slipRef = String(payslip.id || '').slice(0, 8).toUpperCase()

  const base = num(snap.base_salary ?? payslip.base_salary)
  const benefits = Array.isArray(snap.benefits) ? snap.benefits : []
  const advances = Array.isArray(snap.advances) ? snap.advances : []
  const advancesRecovered = num(snap.advances_recovered ?? payslip.advances_recovered)
  const gross = num(snap.gross ?? payslip.gross)
  const net = num(snap.net ?? payslip.net)

  const addressLines = letterhead.addressLines.map((l) => esc(l)).join('<br/>')
  const letterheadContact = [
    addressLines,
    letterhead.contactPhone ? `Contact: ${esc(letterhead.contactPhone)}` : '',
    letterhead.email ? esc(letterhead.email) : '',
  ]
    .filter(Boolean)
    .join('<br/>')

  const earningRows = [
    `<tr><td>Basic salary</td><td class="amt">${money(base)}</td></tr>`,
    ...benefits.map(
      (b) => `<tr><td>${esc(b.name)}</td><td class="amt">${money(b.amount)}</td></tr>`,
    ),
  ].join('')

  const deductionRows = advances.length
    ? advances
        .map(
          (a) =>
            `<tr><td>Salary advance recovery${a.date ? ` <span class="sub">(${esc(String(a.date).slice(0, 10))})</span>` : ''}</td><td class="amt">${money(a.amount)}</td></tr>`,
        )
        .join('')
    : `<tr><td class="empty">No deductions this period</td><td class="amt">${money(0)}</td></tr>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Salary advice — ${esc(staffName)}</title>
  <style>
    :root { --ink:#111; --muted:#555; --line:#ccc; --brand:#0b7285; --bg:#f4f6f8; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: var(--ink);
      margin: 0;
      background: #fff;
    }
    .sheet { max-width: 800px; margin: 0 auto; padding: 36px; }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 20px;
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
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      text-align: right;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--brand);
    }
    .doc-meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 8px;
      line-height: 1.6;
    }
    .rule {
      border: 0;
      border-top: 3px solid var(--brand);
      margin: 0 0 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 32px;
      margin: 0 0 22px;
    }
    .field { font-size: 13px; }
    .field .k {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.08em;
    }
    .field .v { font-weight: 600; margin-top: 2px; }
    .cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .card h2 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--brand);
      margin: 0 0 6px;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--line);
    }
    table { width: 100%; border-collapse: collapse; }
    .card td {
      padding: 7px 0;
      border-bottom: 1px dashed var(--line);
      font-size: 13px;
      vertical-align: top;
    }
    .card .sub { color: var(--muted); font-size: 11px; }
    .card .empty { color: var(--muted); font-style: italic; }
    .amt {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .totals {
      margin-top: 28px;
      border-top: 2px solid var(--ink);
      padding-top: 4px;
    }
    .totals table td {
      padding: 8px 0;
      font-size: 13px;
      border-bottom: 1px solid var(--line);
    }
    .totals .label { font-weight: 600; }
    .totals .net-row td {
      border-bottom: none;
      border-top: 2px solid var(--ink);
      padding-top: 12px;
      font-size: 16px;
      font-weight: 800;
    }
    .words {
      font-size: 12px;
      color: var(--muted);
      font-style: italic;
      margin-top: 10px;
    }
    .sign {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 48px;
    }
    .sign .line {
      border-top: 1px solid var(--ink);
      padding-top: 6px;
      font-size: 11px;
      color: var(--muted);
    }
    .foot {
      margin-top: 28px;
      border-top: 1px solid var(--line);
      padding-top: 12px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.6;
    }
    @media print {
      .sheet { padding: 0; max-width: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .letterhead-logo { max-height: 64px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="head">
      <div class="letterhead">
        <div class="letterhead-row">
          <img
            class="letterhead-logo"
            src="${esc(logoUrl)}"
            alt="${esc(companyName)}"
          />
          <p class="letterhead-meta">
            ${letterheadContact || '—'}
          </p>
        </div>
      </div>
      <div class="doc-head-right">
        <h1 class="doc-title">Salary Advice</h1>
        <div class="doc-meta">
          Pay period: <strong>${esc(periodLabel)}</strong><br/>
          Pay date: <strong>${esc(payday || '—')}</strong><br/>
          Slip ref: <strong>${esc(slipRef || '—')}</strong>
        </div>
      </div>
    </header>
    <hr class="rule" />

    <div class="grid">
      <div class="field"><div class="k">Employee</div><div class="v">${esc(staffName || '—')}</div></div>
      <div class="field"><div class="k">Employee ID</div><div class="v">${esc(employeeRef || '—')}</div></div>
      <div class="field"><div class="k">Job title</div><div class="v">${esc(jobTitle || '—')}</div></div>
      <div class="field"><div class="k">Status</div><div class="v">${esc(titleCase(status) || '—')}</div></div>
      ${email ? `<div class="field"><div class="k">Email</div><div class="v">${esc(email)}</div></div>` : ''}
      ${phone ? `<div class="field"><div class="k">Phone</div><div class="v">${esc(phone)}</div></div>` : ''}
      ${startDate ? `<div class="field"><div class="k">Date joined</div><div class="v">${esc(startDate)}</div></div>` : ''}
      ${bankName || bankAccount ? `<div class="field"><div class="k">Bank</div><div class="v">${esc([bankName, bankAccount].filter(Boolean).join(' · '))}</div></div>` : ''}
    </div>

    <div class="cols">
      <div class="card">
        <h2>Earnings</h2>
        <table><tbody>${earningRows}</tbody></table>
      </div>
      <div class="card">
        <h2>Deductions</h2>
        <table><tbody>${deductionRows}</tbody></table>
      </div>
    </div>

    <div class="totals">
      <table>
        <tbody>
          <tr>
            <td class="label">Gross pay</td>
            <td class="amt">${esc(currency)} ${money(gross)}</td>
          </tr>
          <tr>
            <td class="label">Total deductions</td>
            <td class="amt">${esc(currency)} ${money(advancesRecovered)}</td>
          </tr>
          <tr class="net-row">
            <td>Net pay</td>
            <td class="amt">${esc(currency)} ${money(net)}</td>
          </tr>
        </tbody>
      </table>
      <p class="words">${esc(amountInWords(net, currency))}</p>
    </div>

    <div class="sign">
      <div class="line">Employer signature / date</div>
      <div class="line">Employee signature / date</div>
    </div>

    <div class="foot">
      This is a computer-generated salary advice and is valid without a signature. Amounts are in
      ${esc(currency)}. Please treat this document as strictly confidential. For any queries about
      your pay, contact the ${esc(companyName)} administration office.
    </div>
  </div>
  <script>window.onload = function () { setTimeout(function(){ window.print(); }, 150); };</script>
</body>
</html>`
}

function num(n) {
  return Number(n) || 0
}

function money(n) {
  return num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function titleCase(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function threeDigitsToWords(n) {
  let out = ''
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  if (hundred) out += `${ONES[hundred]} hundred`
  if (rest) {
    if (out) out += ' and '
    if (rest < 20) out += ONES[rest]
    else {
      out += TENS[Math.floor(rest / 10)]
      if (rest % 10) out += `-${ONES[rest % 10]}`
    }
  }
  return out
}

function intToWords(n) {
  if (n === 0) return 'zero'
  const scales = ['', ' thousand', ' million', ' billion']
  let scale = 0
  let out = ''
  let value = n
  while (value > 0) {
    const chunk = value % 1000
    if (chunk) {
      const words = threeDigitsToWords(chunk) + scales[scale]
      out = words + (out ? ` ${out}` : '')
    }
    value = Math.floor(value / 1000)
    scale += 1
  }
  return out.trim()
}

function amountInWords(amount, currency) {
  const unit = currency === 'BWP' ? 'Pula' : currency
  const whole = Math.floor(num(amount))
  const cents = Math.round((num(amount) - whole) * 100)
  const words = intToWords(whole)
  const capital = words.charAt(0).toUpperCase() + words.slice(1)
  return `${unit} ${capital} and ${String(cents).padStart(2, '0')}/100 only`
}
