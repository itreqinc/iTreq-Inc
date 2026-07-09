import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'

function Chevron({ direction, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {direction === 'left' ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  )
}

export function RecoveryPhoto({ photos = [], alt = 'Recovery photo', className = '' }) {
  const items = photos.filter(Boolean)
  const [index, setIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const count = items.length
  const current = count > 0 ? items[index] : null

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + count) % count)
  }, [count])

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % count)
  }, [count])

  useEffect(() => {
    if (!lightboxOpen) return

    function onKeyDown(e) {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [lightboxOpen, goPrev, goNext])

  if (!current) {
    return (
      <div
        className={`flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-ink-950/60 px-4 text-center ${className}`}
      >
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-azure-500/10 text-azure-400">
          <Icon name="recovery" className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-ink-200">Photo placeholder</p>
        <p className="mt-2 max-w-[220px] text-xs leading-relaxed text-ink-400">
          Recovery photos appear here once approved. Faces, car registration numbers and other
          identifying signs are blurred before publishing.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className={`overflow-hidden rounded-2xl border border-white/10 bg-ink-950 ${className}`}>
        <div className="group relative">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full cursor-zoom-in text-left"
            aria-label={`View recovery photo ${index + 1} of ${count}`}
          >
            <img
              src={current}
              alt={`${alt} — photo ${index + 1} of ${count}`}
              className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:brightness-110"
              loading="lazy"
            />
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/80 text-white opacity-0 shadow-lg ring-1 ring-white/10 transition hover:bg-ink-900 group-hover:opacity-100"
                aria-label="Previous photo"
              >
                <Chevron direction="left" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950/80 text-white opacity-0 shadow-lg ring-1 ring-white/10 transition hover:bg-ink-900 group-hover:opacity-100"
                aria-label="Next photo"
              >
                <Chevron direction="right" className="h-5 w-5" />
              </button>
              <span className="absolute bottom-2 right-2 rounded-full bg-ink-950/80 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/10">
                {index + 1} / {count}
              </span>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-white/10 p-2">
            {items.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition ${
                  i === index ? 'ring-brand-400' : 'ring-transparent opacity-70 hover:opacity-100'
                }`}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
              >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-ink-400">
          Tap to enlarge{count > 1 ? ' · use arrows to browse' : ''}. Faces, registration plates and
          identifying details are blurred before publication.
        </p>
      </div>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Recovery photo viewer"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20"
            aria-label="Close"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goPrev()
                }}
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20 sm:left-6"
                aria-label="Previous photo"
              >
                <Chevron direction="left" className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  goNext()
                }}
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20 sm:right-6"
                aria-label="Next photo"
              >
                <Chevron direction="right" className="h-6 w-6" />
              </button>
              <p className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white ring-1 ring-white/20">
                {index + 1} / {count}
              </p>
            </>
          )}

          <img
            src={current}
            alt={`${alt} — photo ${index + 1} of ${count}`}
            className="max-h-[85vh] max-w-[min(100%,1100px)] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
