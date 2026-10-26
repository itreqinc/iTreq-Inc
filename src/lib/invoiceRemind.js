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

function documentsAccessParagraph(count) {
  const lead = count > 1 ? 'Both of these documents' : 'This document'
  return `${lead} can be accessed on your portal on ${PORTAL_HOST} (you should login with your email and password).

For any enquiries on payments please contact iTreq Inc Staff at ${SALES_EMAIL} or call/WhatsApp ${PAYMENTS_PHONE_DISPLAY}.

Regards`
}

function emailHtmlFromText(text) {
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222">
${text
  .split(/\n\n/)
  .map((block) => `<p>${linkifyEscaped(escapeHtml(block)).replace(/\n/g, '<br/>')}</p>`)
  .join('\n')}
</body>
</html>`
}

export function buildInvoiceRemindPlainText({
  clientName,
  monthLabel,
  totalLabel,
  periodLabel,
}) {
  return `Dear ${clientName}

Please find attached here your ${monthLabel} Invoice. This invoice takes your total balance to ${totalLabel}. Also attached with this invoice is your statement for the period ${periodLabel} for your acknowledgement.

${documentsAccessParagraph(2)}`
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
  const subjectNumber = docNumber ? ` (${docNumber})` : ''
  return {
    subject: `${monthLabel} invoice${subjectNumber} — ${COMPANY.name}`,
    html: emailHtmlFromText(text),
    text,
  }
}

/** One invoice from the invoice or accounts menu: invoice PDF, statement PDF, or both. */
export function buildClientDocumentsEmail({
  clientName,
  includeInvoice,
  includeStatement,
  monthLabel,
  totalLabel,
  periodLabel,
  docNumber,
}) {
  const subjectNumber = docNumber ? ` (${docNumber})` : ''
  let subject = `Statement — ${COMPANY.name}`
  let body = `Please find attached your statement for the period ${periodLabel} for your acknowledgement. Your balance on this statement is ${totalLabel}.`
  if (includeInvoice && includeStatement) {
    subject = `${monthLabel} invoice${subjectNumber} — ${COMPANY.name}`
    body = `Please find attached here your ${monthLabel} Invoice. This invoice takes your total balance to ${totalLabel}. Also attached with this invoice is your statement for the period ${periodLabel} for your acknowledgement.`
  } else if (includeInvoice) {
    subject = `${monthLabel} invoice${subjectNumber} — ${COMPANY.name}`
    body = `Please find attached here your ${monthLabel} Invoice${subjectNumber}.`
  }
  const text = `Dear ${clientName}

${body}

${documentsAccessParagraph(includeInvoice && includeStatement ? 2 : 1)}`
  return { subject, html: emailHtmlFromText(text), text }
}
