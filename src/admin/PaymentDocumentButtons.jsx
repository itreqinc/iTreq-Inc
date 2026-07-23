import { useCallback, useState } from 'react'
import { opsApi } from '../lib/opsApi'
import {
  openPaymentDocumentPrintWindow,
  fillPaymentDocumentPrintWindow,
  closePaymentDocumentPrintWindow,
  buildMailtoForPaymentDocument,
} from '../lib/paymentDocument'
import { useOpsAlert } from './OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary } from './ui'

export function usePaymentDocumentActions({
  paymentId,
  isDirty = false,
  dirtyMessage = 'Save your changes before printing or emailing this receipt.',
}) {
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [busy, setBusy] = useState(false)

  const printOrSave = useCallback(async () => {
    if (!paymentId) {
      showError('Save this payment first, then you can print a receipt.')
      return
    }
    if (isDirty) {
      showError(dirtyMessage)
      return
    }

    const opened = openPaymentDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setBusy(true)
    const { data, error } = await opsApi.getPaymentDocumentBundle(paymentId)
    setBusy(false)
    if (error) {
      closePaymentDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    const result = fillPaymentDocumentPrintWindow(win, data.model)
    if (!result.ok) showError(result.message)
  }, [paymentId, isDirty, dirtyMessage, showError])

  const emailToClient = useCallback(async () => {
    if (!paymentId) {
      showError('Save this payment first, then you can email a receipt.')
      return
    }
    if (isDirty) {
      showError(dirtyMessage)
      return
    }

    setBusy(true)
    const preview = await opsApi.getPaymentDocumentBundle(paymentId)
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
      title: 'Email payment receipt to client?',
      message: `A copy will be sent to ${to}.`,
      confirmLabel: 'Send email',
    })
    if (!ok) return

    setBusy(true)
    const { error } = await opsApi.sendPaymentDocumentEmail(paymentId)
    setBusy(false)

    if (!error) {
      showSuccess(`Email sent to ${to}.`)
      return
    }

    const mailto = buildMailtoForPaymentDocument(model)
    if (mailto.ok) {
      const useMail = await confirm({
        title: 'Automatic email unavailable',
        message: `${error.message} You can open your email app with the client address and a summary pre-filled instead.`,
        confirmLabel: 'Open email app',
        cancelLabel: 'Cancel',
      })
      if (useMail) window.location.href = mailto.href
      return
    }

    showWarning(error.message)
  }, [
    paymentId,
    isDirty,
    dirtyMessage,
    confirm,
    showError,
    showSuccess,
    showWarning,
  ])

  return { printOrSave, emailToClient, busy }
}

export function PaymentDocumentButtons({
  paymentId,
  isDirty = false,
  disabled = false,
  dirtyMessage,
  alwaysShow = false,
  variant = 'secondary',
}) {
  const { printOrSave, emailToClient, busy } = usePaymentDocumentActions({
    paymentId,
    isDirty,
    dirtyMessage,
  })

  if (!paymentId && !alwaysShow) return null

  const btnClass = variant === 'primary' ? adminBtnPrimary : adminBtnSecondary
  const canShare = Boolean(paymentId) && !isDirty && !disabled && !busy
  const shareTitle = !paymentId
    ? 'Save this payment first'
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
        title={shareTitle || 'Opens a printable receipt — use Print and choose Save as PDF'}
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
