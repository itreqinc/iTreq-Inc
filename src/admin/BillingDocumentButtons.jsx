import { useCallback, useState } from 'react'
import { opsApi } from '../lib/opsApi'
import {
  openBillingDocumentPrintWindow,
  fillBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  buildMailtoForBillingDocument,
} from '../lib/billingDocument'
import { useOpsAlert } from './OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary } from './ui'

/**
 * Print / save PDF and email actions for saved quotations and invoices.
 */
export function useBillingDocumentActions({
  documentType,
  documentId,
  isDirty = false,
  dirtyMessage = 'Save your changes before printing or emailing this document.',
  onQuotationSent,
}) {
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [busy, setBusy] = useState(false)

  const guardReady = useCallback(async () => {
    if (!documentId) {
      showError('Save this document first, then you can print or email it.')
      return false
    }
    if (isDirty) {
      showError(dirtyMessage)
      return false
    }
    return true
  }, [documentId, isDirty, dirtyMessage, showError])

  const printOrSave = useCallback(async () => {
    if (!documentId) {
      showError('Save this document first, then you can print or email it.')
      return
    }
    if (isDirty) {
      showError(dirtyMessage)
      return
    }

    const opened = openBillingDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setBusy(true)
    const { data, error } = await opsApi.getBillingDocumentBundle(documentType, documentId)
    setBusy(false)
    if (error) {
      closeBillingDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    const result = fillBillingDocumentPrintWindow(win, data.model)
    if (!result.ok) {
      showError(result.message)
    }
  }, [documentType, documentId, isDirty, dirtyMessage, showError])

  const emailToClient = useCallback(async () => {
    if (!(await guardReady())) return

    setBusy(true)
    const preview = await opsApi.getBillingDocumentBundle(documentType, documentId)
    setBusy(false)
    if (preview.error) {
      showError(preview.error.message)
      return
    }

    const { model } = preview.data
    const to = model.client.email?.trim()
    if (!to) {
      showError('This client has no email address on file. Update the client record first.')
      return
    }

    const ok = await confirm({
      title: `Email ${model.title.toLowerCase()} to client?`,
      message: `A copy will be sent to ${to}. The message includes the full ${model.title.toLowerCase()} details.`,
      confirmLabel: 'Send email',
    })
    if (!ok) return

    setBusy(true)
    const { error } = await opsApi.sendBillingDocumentEmail(documentType, documentId)

    if (!error && documentType === 'quote') {
      const marked = await opsApi.markQuotationSent(documentId)
      setBusy(false)
      if (marked.error) {
        showWarning(
          `Email sent to ${to}, but the quotation could not be marked as sent: ${marked.error.message}`,
        )
        return
      }
      showSuccess(`Email sent to ${to}. Quotation marked as sent.`)
      onQuotationSent?.(marked.data)
      return
    }

    setBusy(false)

    if (!error) {
      showSuccess(`Email sent to ${to}.`)
      return
    }

    const mailto = buildMailtoForBillingDocument(model)
    if (mailto.ok) {
      const useMail = await confirm({
        title: 'Automatic email unavailable',
        message: `${error.message} You can open your email app with the client address and a summary pre-filled instead.`,
        confirmLabel: 'Open email app',
        cancelLabel: 'Cancel',
      })
      if (useMail) {
        window.location.href = mailto.href
      }
      return
    }

    showWarning(error.message)
  }, [
    documentType,
    documentId,
    guardReady,
    confirm,
    showError,
    showSuccess,
    showWarning,
    onQuotationSent,
  ])

  return { printOrSave, emailToClient, busy }
}

export function BillingDocumentButtons({
  documentType,
  documentId,
  isDirty = false,
  disabled = false,
  dirtyMessage,
  /** When true, buttons stay visible even before the document is saved (disabled). */
  alwaysShow = false,
  /** Button colour: primary matches Save; secondary is outline. */
  variant = 'secondary',
  onQuotationSent,
}) {
  const { printOrSave, emailToClient, busy } = useBillingDocumentActions({
    documentType,
    documentId,
    isDirty,
    dirtyMessage,
    onQuotationSent,
  })

  if (!documentId && !alwaysShow) return null

  const btnClass = variant === 'primary' ? adminBtnPrimary : adminBtnSecondary
  const canShare = Boolean(documentId) && !isDirty && !disabled && !busy
  const shareTitle = !documentId
    ? 'Save this document first'
    : isDirty
      ? dirtyMessage || 'Save your changes first'
      : undefined

  return (
    <>
      <button
        type="button"
        disabled={!canShare}
        onClick={printOrSave}
        className={btnClass}
        title={shareTitle || 'Opens a printable view — use Print and choose Save as PDF'}
      >
        {busy ? 'Loading…' : 'Print / Save PDF'}
      </button>
      <button
        type="button"
        disabled={!canShare}
        onClick={emailToClient}
        className={btnClass}
        title={shareTitle}
      >
        Email to client
      </button>
    </>
  )
}
