/**
 * Lets Ops alerts pause row-highlight fade while a modal is open, then resume
 * after dismiss — without each page wiring hold/release by hand.
 */

let alertOpen = false
let pauseFn = null
let resumeFn = null

export function registerHighlightAlertBridge({ pause, resume }) {
  pauseFn = pause
  resumeFn = resume
  return () => {
    if (pauseFn === pause) pauseFn = null
    if (resumeFn === resume) resumeFn = null
  }
}

export function isHighlightAlertOpen() {
  return alertOpen
}

export function pauseHighlightForAlert() {
  alertOpen = true
  pauseFn?.()
}

export function resumeHighlightAfterAlert() {
  alertOpen = false
  resumeFn?.()
}
