import {
  openBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
} from './billingDocument'
import {
  buildPaymentDocumentEmailHtml,
  buildPaymentDocumentModel,
  buildPaymentDocumentPlainText,
  buildPaymentDocumentPrintPage,
  getPaymentDocumentPrintPath,
} from './paymentDocumentHtml'

export {
  openBillingDocumentPrintWindow as openPaymentDocumentPrintWindow,
  closeBillingDocumentPrintWindow as closePaymentDocumentPrintWindow,
}

export function fillPaymentDocumentPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildPaymentDocumentPrintPage(model),
    title: `${model.title} ${model.docNumber}`,
    path: getPaymentDocumentPrintPath(model),
  })
}

export function preparePaymentDocumentBundle({ payment, client, settings }) {
  const model = buildPaymentDocumentModel({ payment, client, settings })
  return {
    model,
    printPageHtml: buildPaymentDocumentPrintPage(model),
    emailHtml: buildPaymentDocumentEmailHtml(model),
    plainText: buildPaymentDocumentPlainText(model),
  }
}

export function buildMailtoForPaymentDocument(model) {
  const to = model.client.email?.trim()
  if (!to) {
    return { ok: false, message: 'This client has no email address on file.' }
  }
  const subject = encodeURIComponent(`${model.title} ${model.docNumber} — ${model.company.name}`)
  const body = encodeURIComponent(
    `${buildPaymentDocumentPlainText(model)}\n\n—\n${model.company.name}\n${model.company.email}`,
  )
  return { ok: true, href: `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}` }
}
