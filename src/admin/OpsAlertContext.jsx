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
        open: true,
        type: options.type || 'warning',
        title: options.title || 'Please confirm',
        message: options.message || '',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        onConfirm: () => {
          setAlert({ ...closedAlert })
          resolve(true)
        },
        _resolveCancel: () => resolve(false),
      })
    })
  }, [])

  const value = useMemo(
    () => ({
      showAlert,
      showSuccess,
      showError,
      showWarning,
      confirm,
      closeAlert: handleClose,
    }),
    [showAlert, showSuccess, showError, showWarning, confirm, handleClose],
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
