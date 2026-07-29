import { useCallback, useEffect, useRef, useState } from 'react'

const HIGHLIGHT_MS = 2000

/**
 * Scroll form into view on open; flash-highlight a table row after save.
 *
 * Returns:
 *  - formRef         – attach to the form element
 *  - highlightId     – the id currently highlighted (for row className)
 *  - scrollToForm()  – call after setShowForm(true)
 *  - highlightRow(id) – call after a successful save/close
 */
export function useScrollAndHighlight() {
  const formRef = useRef(null)
  const [highlightId, setHighlightId] = useState(null)
  const timerRef = useRef(null)

  const scrollToForm = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const highlightRow = useCallback((id) => {
    if (!id) return
    setHighlightId(id)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-row-id="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { formRef, highlightId, scrollToForm, highlightRow }
}
