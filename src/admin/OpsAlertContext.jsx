import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertModal } from './AlertModal'

const OpsAlertContext = createContext(null)

const closedAlert = {
  open: false,
  type: 'info',
  title: '',
  message: '',
  confirmLabel: 'OK',
  cancelLabel: 'Cancel',
  promptLabel: '',
  promptPlaceholder: '',
  onConfirm: null,
  _resolveCancel: null,
}

export function OpsAlertProvider({ children }) {
  const [alert, setAlert] = useState(closedAlert)

  const handleClose = useCallback(() => {
    setAlert((prev) => {
      if (typeof prev._resolveCancel === 'function') prev._resolveCancel()
      return { ...closedAlert }
    })
  }, [])

  const showAlert = useCallback((options = {}) => {
    setAlert({
      ...closedAlert,
      open: true,
      type: options.type || 'info',
      title: options.title || '',
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'OK',
      cancelLabel: options.cancelLabel || 'Cancel',
    })
  }, [])

  const showSuccess = useCallback(
    (message, title = 'Saved') => showAlert({ type: 'success', title, message }),
    [showAlert],
  )

  const showError = useCallback(
    (message, title = 'Something went wrong') =>
      showAlert({ type: 'error', title, message }),
    [showAlert],
  )

  const showWarning = useCallback(
    (message, title = 'Please check') => showAlert({ type: 'warning', title, message }),
    [showAlert],
  )

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setAlert({
        ...closedAlert,
        open: true,
        type: options.type || 'warning',
        title: options.title || 'Please confirm',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        promptLabel: options.promptLabel || '',
        promptPlaceholder: options.promptPlaceholder || '',
        onConfirm: (result) => {
          setAlert({ ...closedAlert })
          resolve(result ?? true)
        },
        _resolveCancel: () => resolve(false),
      })
    })
  }, [])

  /** Confirm dialog that also collects a short typed answer. Resolves '' if cancelled. */
  const prompt = useCallback(
    async (options = {}) => {
      const result = await confirm({
        type: options.type || 'warning',
        title: options.title || 'Please confirm',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        promptLabel: options.promptLabel || 'Reason',
        promptPlaceholder: options.promptPlaceholder || '',
      })
      return typeof result === 'string' ? result : ''
    },
    [confirm],
  )

  const value = useMemo(
    () => ({
      showAlert,
      showSuccess,
      showError,
      showWarning,
      confirm,
      prompt,
      closeAlert: handleClose,
    }),
    [showAlert, showSuccess, showError, showWarning, confirm, prompt, handleClose],
  )

  return (
    <OpsAlertContext.Provider value={value}>
      {children}
      <AlertModal
        open={alert.open}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        confirmLabel={alert.confirmLabel}
        cancelLabel={alert.cancelLabel}
        promptLabel={alert.promptLabel}
        promptPlaceholder={alert.promptPlaceholder}
        onConfirm={alert.onConfirm || undefined}
        onClose={handleClose}
      />
    </OpsAlertContext.Provider>
  )
}

export function useOpsAlert() {
  const ctx = useContext(OpsAlertContext)
  if (!ctx) {
    throw new Error('useOpsAlert must be used within OpsAlertProvider')
  }
  return ctx
}
