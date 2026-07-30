import { useEffect } from 'react'

/** Expanded panel stays inside the viewport; long content scrolls inside. */
export const COLLAPSE_BODY_CLASS =
  'max-h-[min(70vh,calc(100dvh-5.5rem))] overflow-y-auto overscroll-contain'

/**
 * Scroll a just-opened collapse so its top sits in view (expand into the screen).
 */
export function bringCollapseIntoView(el, { behavior = 'smooth' } = {}) {
  if (!el || typeof el.scrollIntoView !== 'function') return

  const run = () => {
    const rect = el.getBoundingClientRect()
    const pad = 12
    const vh = window.innerHeight || document.documentElement.clientHeight
    const mostlyBelowFold = rect.top > vh * 0.4
    const clippedTop = rect.top < pad
    const clippedBottom = rect.bottom > vh - pad
    if (clippedTop || clippedBottom || mostlyBelowFold) {
      el.scrollIntoView({ behavior, block: 'start', inline: 'nearest' })
    }
  }

  // Two frames: wait for open layout / CSS grid expand to apply.
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

/** Call when a controlled collapse becomes open. */
export function useCollapseIntoView(open, ref) {
  useEffect(() => {
    if (!open) return
    bringCollapseIntoView(ref?.current)
  }, [open, ref])
}

/** Native <details>: scroll into view whenever it opens. */
export function useDetailsIntoView(ref) {
  useEffect(() => {
    const el = ref?.current
    if (!el) return undefined

    function onToggle() {
      if (el.open) bringCollapseIntoView(el)
    }

    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [ref])
}
