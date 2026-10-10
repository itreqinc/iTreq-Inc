import { COMPANY } from '../data/site'
import { formatBillingPeriodLabel } from './invoiceDates'
import { monthStartIso } from './dateRange'
import { invoiceAffectsClientBalance } from './payments'

const PORTAL_HOST = 'www.itreqinc.com'
const SALES_EMAIL = 'sales@itreqinc.com'
const PAYMENTS_PHONE_DISPLAY = '+267 77 072 013'

export function invoiceCanRemind(row) {
  return Boolean(row?.has_monthly_fee) && invoiceAffectsClientBalance(row?.status)
}

export function safePdfFilename(name) {
  const cleaned = String(name || 'document')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || 'document'
}

export function remindMonthLabel(invoice) {
  const period = String(invoice?.billing_period || '').slice(0, 10)
  if (period) return formatBillingPeriodLabel(period)
  const issue = String(invoice?.issue_date || '').slice(0, 10)
  if (issue) return formatBillingPeriodLabel(monthStartIso(issue))
  return 'monthly'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function linkifyEscaped(escaped) {
  return escaped
    .replaceAll(
      escapeHtml(PORTAL_HOST),
      `<a href="https://${PORTAL_HOST}">${escapeHtml(PORTAL_HOST)}</a>`,
    )
    .replaceAll(
      escapeHtml(SALES_EMAIL),
      `<a href="mailto:${SALES_EMAIL}">${escapeHtml(SALES_EMAIL)}</a>`,
    )
    .replaceAll(
      escapeHtml(PAYMENTS_PHONE_DISPLAY),
      `<a href="https://wa.me/26777072013">${escapeHtml(PAYMENTS_PHONE_DISPLAY)}</a>`,
    )
}

export function buildInvoiceRemindPlainText({
  clientName,
  monthLabel,
  totalLabel,
  periodLabel,
}) {
  return `Dear ${clientName}

Please find attached here your ${monthLabel} Invoice. This invoice takes your total balance to ${totalLabel}. Also attached with this invoice is your statement for the period ${periodLabel} for your acknowledgement.

Both of these documents can be accessed on your portal on ${PORTAL_HOST} (you should login with your email and password).

For any enquiries on payments please contact iTreq Inc Staff at ${SALES_EMAIL} or call/WhatsApp ${PAYMENTS_PHONE_DISPLAY}.

Regards`
}

export function buildInvoiceRemindEmail({
  clientName,
  monthLabel,
  totalLabel,
  periodLabel,
  docNumber,
}) {
  const text = buildInvoiceRemindPlainText({
    clientName,
    monthLabel,
    totalLabel,
    periodLabel,
  })
  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222">
${text
  .split(/\n\n/)
  .map((block) => `<p>${linkifyEscaped(escapeHtml(block)).replace(/\n/g, '<br/>')}</p>`)
  .join('\n')}
</body>
</html>`
  const subjectNumber = docNumber ? ` (${docNumber})` : ''
  return {
    subject: `${monthLabel} invoice${subjectNumber} — ${COMPANY.name}`,
    html,
    text,
  }
}
