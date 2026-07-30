import { useEffect, useId, useRef, useState } from 'react'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from './ui'

const VARIANTS = {
  success: {
    title: 'Success',
    panel: 'border-brand-500/40',
    accent: 'text-brand-300',
    iconBg: 'bg-brand-500/15 text-brand-300',
  },
  error: {
    title: 'Something went wrong',
    panel: 'border-red-500/40',
    accent: 'text-red-200',
    iconBg: 'bg-red-500/15 text-red-200',
  },
  warning: {
    title: 'Please check',
    panel: 'border-amber-500/40',
    accent: 'text-amber-200',
    iconBg: 'bg-amber-500/15 text-amber-200',
  },
  info: {
    title: 'Notice',
    panel: 'border-azure-500/40',
    accent: 'text-azure-200',
    iconBg: 'bg-azure-500/15 text-azure-200',
  },
}

function VariantIcon({ type }) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 011.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  if (type === 'warning') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  if (type === 'info') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-4a1 1 0 100 2 1 1 0 000-2zm-1 4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1zm1 3a1 1 0 100 2 1 1 0 000-2z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 011.06 0L10 7.94l.66-.72a.75.75 0 111.1 1.02l-.85.93.97.97a.75.75 0 11-1.06 1.06L10 10.06l-.82.82a.75.75 0 11-1.06-1.06l.97-.97-.85-.93a.75.75 0 010-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/**
 * Reusable Ops modal for success / error / warning / info / confirm / progress.
 * Pass onConfirm for a confirm dialog, plus promptLabel to collect a short answer.
 * Pass progress={{ current, total, label }} while a bulk run is executing (no dismiss).
 */
export function AlertModal({
  open,
  type = 'info',
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  promptLabel = '',
  promptPlaceholder = '',
  progress = null,
  onConfirm,
  onClose,
}) {
  const titleId = useId()
  const descId = useId()
  const confirmRef = useRef(null)
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const variant = VARIANTS[type] || VARIANTS.info
  const isProgress = Boolean(progress)
  const isConfirm = !isProgress && typeof onConfirm === 'function'
  const isPrompt = isConfirm && Boolean(promptLabel)

  const total = Math.max(0, Number(progress?.total) || 0)
  const current = Math.min(total, Math.max(0, Number(progress?.current) || 0))
  const percent =
    progress?.percent != null
      ? Math.min(100, Math.max(0, Math.round(Number(progress.percent))))
      : total > 0
        ? Math.round((current / total) * 100)
        : 0
  const progressLabel = String(progress?.label || '').trim()

  useEffect(() => {
    if (!open) return undefined
    setValue('')
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(
      () => (inputRef.current || confirmRef.current)?.focus(),
      0,
    )
    function onKey(e) {
      if (e.key === 'Escape' && !isProgress) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, isProgress])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
        aria-label={isProgress ? 'Progress dialog' : 'Close dialog'}
        disabled={isProgress}
        onClick={isProgress ? undefined : onClose}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message || isProgress ? descId : undefined}
        aria-busy={isProgress || undefined}
        className={`relative w-full max-w-md rounded-2xl border bg-ink-900 p-5 shadow-2xl ${variant.panel}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${variant.iconBg}`}
          >
            <VariantIcon type={type} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={`font-display text-lg font-semibold ${variant.accent}`}>
              {title || variant.title}
            </h2>
            {message ? (
              <p id={descId} className="mt-2 text-sm leading-relaxed text-ink-200">
                {message}
              </p>
            ) : null}
          </div>
        </div>

        {isProgress ? (
          <div id={message ? undefined : descId} className="mt-5 space-y-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-white tabular-nums">
                {total > 0 ? `${percent}%` : '…'}
              </span>
              {total > 0 ? (
                <span className="text-ink-400 tabular-nums">
                  {current} of {total}
                </span>
              ) : null}
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total > 0 ? 100 : undefined}
              aria-valuenow={total > 0 ? percent : undefined}
              aria-label={progressLabel || title || 'Progress'}
            >
              {total > 0 ? (
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500/80" />
              )}
            </div>
            <p className="min-h-[1.25rem] truncate text-sm text-ink-200">
              {progressLabel ? (
                <>
                  <span className="text-ink-400">Now: </span>
                  <span className="font-medium text-white">{progressLabel}</span>
                </>
              ) : (
                <span className="text-ink-500">Working…</span>
              )}
            </p>
          </div>
        ) : null}

        {isPrompt ? (
          <label className="mt-4 block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              {promptLabel}
            </span>
            <textarea
              ref={inputRef}
              rows={3}
              className={adminFieldClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={promptPlaceholder}
            />
          </label>
        ) : null}

        {!isProgress ? (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {isConfirm ? (
              <button type="button" className={adminBtnSecondary} onClick={onClose}>
                {cancelLabel}
              </button>
            ) : null}
            <button
              ref={confirmRef}
              type="button"
              disabled={isPrompt && !value.trim()}
              className={adminBtnPrimary}
              onClick={() => {
                if (isConfirm) onConfirm(isPrompt ? value.trim() : true)
                else onClose?.()
              }}
            >
              {isConfirm ? confirmLabel : confirmLabel || 'OK'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
