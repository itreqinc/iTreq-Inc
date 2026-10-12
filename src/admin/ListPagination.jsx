import { useCallback, useEffect, useRef, useState } from 'react'
import { adminBtnSecondary } from './ui'

export const LIST_PAGE_SIZES = [20, 50, 100]
const STORAGE_KEY = 'itreq-list-page-size'
const listeners = new Set()

function readListPageSize() {
  try {
    const size = Number(localStorage.getItem(STORAGE_KEY))
    return LIST_PAGE_SIZES.includes(size) ? size : 20
  } catch {
    return 20
  }
}

function writeListPageSize(size) {
  try {
    localStorage.setItem(STORAGE_KEY, String(size))
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn(size))
}

function subscribeListPageSize(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Slice a filtered list. `resetKey` returns to page 1 when filters change.
 * `focusId` opens the page that contains that row (highlight or selection).
 */
export function useListPagination(items, { resetKey = '', focusId = null } = {}) {
  const list = Array.isArray(items) ? items : []
  const [pageSize, setPageSizeState] = useState(readListPageSize)
  const [page, setPage] = useState(1)
  const resetRef = useRef(resetKey)
  const focusRef = useRef(null)

  useEffect(
    () =>
      subscribeListPageSize((size) => {
        focusRef.current = null
        setPageSizeState(size)
        setPage(1)
      }),
    [],
  )

  const pageCount = Math.max(1, Math.ceil(list.length / pageSize) || 1)
  let nextPage = page
  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey
    focusRef.current = null
    nextPage = 1
  }
  if (focusId != null && focusId !== '' && focusRef.current !== focusId) {
    const index = list.findIndex((row) => row?.id === focusId)
    if (index >= 0) {
      nextPage = Math.floor(index / pageSize) + 1
      focusRef.current = focusId
    } else if (list.length > 0) {
      focusRef.current = focusId
    }
  }
  if (nextPage > pageCount) nextPage = pageCount
  if (nextPage < 1) nextPage = 1
  if (nextPage !== page) setPage(nextPage)

  const start = (nextPage - 1) * pageSize
  const setPageSize = useCallback((value) => {
    const size = LIST_PAGE_SIZES.includes(value) ? value : 20
    writeListPageSize(size)
  }, [])

  return {
    rows: list.slice(start, start + pageSize),
    page: nextPage,
    pageCount,
    pageSize,
    setPage,
    setPageSize,
    total: list.length,
    from: list.length ? start + 1 : 0,
    to: Math.min(start + pageSize, list.length),
  }
}

export function ListPagination({ list }) {
  if (!list?.total) return null
  return (
    <nav
      aria-label="List pages"
      className="flex flex-wrap items-center gap-3 border-t border-white/10 px-3 py-3 sm:px-4"
    >
      <p className="text-xs text-ink-400">
        {list.from}–{list.to} of {list.total}
      </p>
      <label className="flex items-center gap-2 text-xs text-ink-400">
        Rows
        <select
          aria-label="Rows per page"
          value={list.pageSize}
          onChange={(e) => list.setPageSize(Number(e.target.value))}
          className="rounded-lg border border-white/15 bg-ink-950/80 px-2 py-1 text-xs text-white outline-none focus:border-brand-500/50"
        >
          {LIST_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className={`${adminBtnSecondary} px-3 py-1.5 text-xs`}
          disabled={list.page <= 1}
          onClick={() => list.setPage(list.page - 1)}
        >
          Previous
        </button>
        <span className="text-xs text-ink-300">
          Page {list.page} of {list.pageCount}
        </span>
        <button
          type="button"
          className={`${adminBtnSecondary} px-3 py-1.5 text-xs`}
          disabled={list.page >= list.pageCount}
          onClick={() => list.setPage(list.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}
