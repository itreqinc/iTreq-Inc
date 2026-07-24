import {
  openBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
} from './billingDocument'
import {
  buildIncomeMethodReportModel,
  buildIncomeMethodReportPrintPage,
  getIncomeMethodReportPrintPath,
} from './incomeMethodReportDocumentHtml'

export {
  openBillingDocumentPrintWindow as openIncomeMethodReportPrintWindow,
  closeBillingDocumentPrintWindow as closeIncomeMethodReportPrintWindow,
}

export function fillIncomeMethodReportPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildIncomeMethodReportPrintPage(model),
    title: model.title,
    path: getIncomeMethodReportPrintPath(model),
  })
}

export function prepareIncomeMethodReportDocument({
  report,
  settings,
  includeZeroMethods = false,
}) {
  const model = buildIncomeMethodReportModel({
    report,
    settings,
    includeZeroMethods,
  })
  return {
    model,
    printPageHtml: buildIncomeMethodReportPrintPage(model),
  }
}
