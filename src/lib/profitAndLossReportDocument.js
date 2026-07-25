import {
  openBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
} from './billingDocument'
import {
  buildProfitAndLossReportModel,
  buildProfitAndLossReportPrintPage,
  getProfitAndLossReportPrintPath,
} from './profitAndLossReportDocumentHtml'

export {
  openBillingDocumentPrintWindow as openProfitAndLossReportPrintWindow,
  closeBillingDocumentPrintWindow as closeProfitAndLossReportPrintWindow,
}

export function fillProfitAndLossReportPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildProfitAndLossReportPrintPage(model),
    title: model.title,
    path: getProfitAndLossReportPrintPath(model),
  })
}

export function prepareProfitAndLossReportDocument({ report, settings }) {
  const model = buildProfitAndLossReportModel({ report, settings })
  return {
    model,
    printPageHtml: buildProfitAndLossReportPrintPage(model),
  }
}
