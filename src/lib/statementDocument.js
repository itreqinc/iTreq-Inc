import {
  openBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
} from './billingDocument'
import {
  buildStatementDocumentModel,
  buildStatementDocumentPrintPage,
  getStatementDocumentPrintPath,
} from './statementDocumentHtml'

export {
  openBillingDocumentPrintWindow as openStatementDocumentPrintWindow,
  closeBillingDocumentPrintWindow as closeStatementDocumentPrintWindow,
}

export function fillStatementDocumentPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildStatementDocumentPrintPage(model),
    title: `Statement — ${model.client.name}`,
    path: getStatementDocumentPrintPath(model),
  })
}

export function prepareStatementDocument({ statement, settings }) {
  const model = buildStatementDocumentModel({ statement, settings })
  return {
    model,
    printPageHtml: buildStatementDocumentPrintPage(model),
  }
}
