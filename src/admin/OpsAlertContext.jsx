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

const closedProgress = {
  open: false,
  title: '',
  message: '',
  current: 0,
  total: 0,
  label: '',
  percent: 0,
}

function progressPercent(current, total) {
  if (!(total > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((Number(current) / Number(total)) * 100)))
}

export function OpsAlertProvider({ children }) {
  const [alert, setAlert] = useState(closedAlert)
  const [progress, setProgress] = useState(closedProgress)

  const handleClose = useCallback(() => {
    setAlert((prev) => {
      if (typeof prev._resolveCancel === 'function') prev._resolveCancel()
      return { ...closedAlert }
    })
  }, [])

  const showAlert = useCallback((options = {}) => {
    setProgress({ ...closedProgress })
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
      setProgress({ ...closedProgress })
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

  const beginProgress = useCallback((options = {}) => {
    setAlert({ ...closedAlert })
    const total = Math.max(0, Number(options.total) || 0)
    const current = Math.max(0, Number(options.current) || 0)
    setProgress({
      open: true,
      title: options.title || 'Working…',
      message: options.message || '',
      current,
      total,
      label: options.label || '',
      percent: progressPercent(current, total),
    })
  }, [])

  const updateProgress = useCallback((options = {}) => {
    setProgress((prev) => {
      if (!prev.open) return prev
      const total = options.total != null ? Math.max(0, Number(options.total) || 0) : prev.total
      const current =
        options.current != null ? Math.max(0, Number(options.current) || 0) : prev.current
      return {
        ...prev,
        title: options.title != null ? options.title : prev.title,
        message: options.message != null ? options.message : prev.message,
        label: options.label != null ? options.label : prev.label,
        current,
        total,
        percent: progressPercent(current, total),
      }
    })
  }, [])

  const endProgress = useCallback(() => {
    setProgress({ ...closedProgress })
  }, [])

  /**
   * After confirm: show progress while processing items one by one.
   * getLabel(item, index) → name shown under the bar (e.g. client name).
   * fn(item, index) → async work for that item.
   */
  const runWithProgress = useCallback(
    async ({ title, message, items, getLabel, fn } = {}) => {
      const list = Array.isArray(items) ? items : []
      beginProgress({
        title: title || 'Working…',
        message: message || '',
        total: list.length,
        current: 0,
        label: '',
      })
      // Allow the progress modal to paint before the first await.
      await new Promise((r) => window.setTimeout(r, 0))
      const results = []
      try {
        for (let i = 0; i < list.length; i += 1) {
          const item = list[i]
          const label =
            typeof getLabel === 'function' ? getLabel(item, i) : String(item?.label ?? item ?? '')
          updateProgress({
            current: i + 1,
            total: list.length,
            label,
          })
          results.push(await fn(item, i))
        }
        return results
      } finally {
        endProgress()
      }
    },
    [beginProgress, updateProgress, endProgress],
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
      beginProgress,
      updateProgress,
      endProgress,
      runWithProgress,
    }),
    [
      showAlert,
      showSuccess,
      showError,
      showWarning,
      confirm,
      prompt,
      handleClose,
      beginProgress,
      updateProgress,
      endProgress,
      runWithProgress,
    ],
  )

  const progressOpen = progress.open
  const alertOpen = alert.open && !progressOpen

  return (
    <OpsAlertContext.Provider value={value}>
      {children}
      <AlertModal
        open={alertOpen}
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
      <AlertModal
        open={progressOpen}
        type="info"
        title={progress.title}
        message={progress.message}
        progress={{
          current: progress.current,
          total: progress.total,
          label: progress.label,
          percent: progress.percent,
        }}
        onClose={() => {}}
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
