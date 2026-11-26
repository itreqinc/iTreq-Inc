import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isHighlightAlertOpen,
  registerHighlightAlertBridge,
} from './highlightAlertBridge'

const HIGHLIGHT_MS = 2000

/**
 * Scroll form into view on open; flash-highlight a table row after save.
 *
 * Fade is paused automatically while an Ops alert modal is open (success /
 * error / confirm), then starts when the modal closes.
 *
 * Returns:
 *  - formRef         – attach to the form element
 *  - highlightId     – the id currently highlighted (for row className)
 *  - scrollToForm()  – call after setShowForm(true)
 *  - highlightRow(id, { scroll, hold, block }) – flash a row; `hold: true`
 *    keeps it solid until releaseHighlight() (optional; alerts also hold via
 *    bridge). Optional `scroll: false` when the caller positions the row
 *    itself. Default `block` is `center` so saved rows clear the sticky header
 *    / floating page CTAs. Pass `block: 'nearest'` (or `scroll: false`) when a
 *    caller owns positioning (e.g. Clients Accounts third-row focus).
 *  - releaseHighlight() – start the fade timer after an explicit hold
 */
export function useScrollAndHighlight() {
  const formRef = useRef(null)
  const [highlightId, setHighlightId] = useState(null)
  const highlightIdRef = useRef(null)
  const timerRef = useRef(null)
  const heldRef = useRef(false)

  const scrollToForm = useCallback(() => {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const startFade = useCallback(() => {
    clearTimeout(timerRef.current)
    heldRef.current = false
    timerRef.current = setTimeout(() => {
      highlightIdRef.current = null
      setHighlightId(null)
    }, HIGHLIGHT_MS)
  }, [])

  const pauseFade = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    if (highlightIdRef.current) heldRef.current = true
  }, [])

  const resumeFade = useCallback(() => {
    if (!highlightIdRef.current) return
    startFade()
  }, [startFade])

  useEffect(() => registerHighlightAlertBridge({ pause: pauseFade, resume: resumeFade }), [
    pauseFade,
    resumeFade,
  ])

  const highlightRow = useCallback(
    (id, { scroll = true, hold = false, block = 'center' } = {}) => {
      if (!id) return
      highlightIdRef.current = id
      setHighlightId(id)
      clearTimeout(timerRef.current)
      timerRef.current = null
      const shouldHold = Boolean(hold) || isHighlightAlertOpen()
      heldRef.current = shouldHold
      if (!shouldHold) startFade()

      if (!scroll) return

      const scrollBlock =
        block === 'start' || block === 'center' || block === 'end' || block === 'nearest'
          ? block
          : 'center'
      const runScroll = () => {
        const el = document.querySelector(`[data-row-id="${CSS.escape(String(id))}"]`)
        el?.scrollIntoView({ behavior: 'smooth', block: scrollBlock, inline: 'nearest' })
      }
      // Double rAF: wait for list/page DOM to settle after setState.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          runScroll()
          // One more pass after smooth scroll layout (pagination / peek).
          window.setTimeout(runScroll, 120)
        })
      })
    },
    [startFade],
  )

  const releaseHighlight = useCallback(() => {
    if (!heldRef.current) return
    if (isHighlightAlertOpen()) return
    startFade()
  }, [startFade])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { formRef, highlightId, scrollToForm, highlightRow, releaseHighlight }
}
