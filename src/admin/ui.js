export const adminFieldClass =
  'w-full rounded-xl border border-white/10 bg-ink-950/80 px-3 py-2 text-sm text-white outline-none transition placeholder:text-ink-500 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20'

/** Visually muted companion to adminFieldClass for locked / view-mode fields. */
export const adminFieldReadonlyClass =
  'w-full cursor-default rounded-xl border border-transparent bg-white/[0.03] px-3 py-2 text-sm text-ink-300 outline-none'

export const adminBtnPrimary =
  'inline-flex items-center justify-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-400 disabled:opacity-50'

export const adminBtnSecondary =
  'inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-ink-200 transition hover:bg-white/5 disabled:opacity-50'

export const adminBtnDanger =
  'inline-flex items-center justify-center rounded-xl border border-red-400/40 bg-transparent px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50'

/**
 * Rounded table frame. Horizontal scroll stays inside the shell so the page
 * itself does not shift sideways when columns are wide.
 */
export const adminTableShellClass =
  'admin-scroll max-w-full overflow-x-auto rounded-2xl border border-white/10'

export const adminTableShellSmClass =
  'admin-scroll max-w-full overflow-x-auto rounded-xl border border-white/10'

export const adminTableClass = 'w-full text-left text-sm'

/** Hide secondary table columns on narrow screens to avoid sideways scroll. */
export const adminColSecondary = 'hidden sm:table-cell'

/** Compact cell padding that still breathes on larger screens. */
export const adminCellPad = 'px-3 py-2.5 sm:px-4 sm:py-3'

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
