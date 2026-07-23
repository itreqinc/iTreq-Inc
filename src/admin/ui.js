export const adminFieldClass =
  'w-full rounded-xl border border-white/10 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-ink-500 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20'

export const adminBtnPrimary =
  'inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50'

export const adminBtnSecondary =
  'inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-ink-200 transition hover:bg-white/5 disabled:opacity-50'

export const adminBtnDanger =
  'inline-flex items-center justify-center rounded-xl border border-red-400/40 bg-transparent px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50'

/** Table rows that open a document on click. */
export const clickableRowClass =
  'cursor-pointer transition-colors hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500/60'

/** Document number / label that looks like a link. */
export const clickableDocClass =
  'font-medium text-brand-400 underline-offset-2 group-hover:underline hover:text-brand-300'

export function activateRowKey(e, onActivate) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onActivate?.()
  }
}

export { formatPula } from '../lib/money'
