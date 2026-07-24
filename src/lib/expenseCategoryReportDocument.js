import {
  openBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  fillPrintWindowWithHtml,
} from './billingDocument'
import {
  buildExpenseCategoryReportModel,
  buildExpenseCategoryReportPrintPage,
  getExpenseCategoryReportPrintPath,
} from './expenseCategoryReportDocumentHtml'

export {
  openBillingDocumentPrintWindow as openExpenseCategoryReportPrintWindow,
  closeBillingDocumentPrintWindow as closeExpenseCategoryReportPrintWindow,
}

export function fillExpenseCategoryReportPrintWindow(win, model) {
  return fillPrintWindowWithHtml(win, {
    html: buildExpenseCategoryReportPrintPage(model),
    title: model.title,
    path: getExpenseCategoryReportPrintPath(model),
  })
}

export function prepareExpenseCategoryReportDocument({
  report,
  settings,
  includeZeroCategories = false,
}) {
  const model = buildExpenseCategoryReportModel({
    report,
    settings,
    includeZeroCategories,
  })
  return {
    model,
    printPageHtml: buildExpenseCategoryReportPrintPage(model),
  }
}
