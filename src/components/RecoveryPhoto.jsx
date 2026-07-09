import { Icon } from './Icon'

export function RecoveryPhoto({ src, alt, className = '' }) {
  if (src) {
    return (
      <div className={`overflow-hidden rounded-2xl border border-white/10 bg-ink-950 ${className}`}>
        <img
          src={src}
          alt={alt}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
        <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-ink-400">
          Faces, registration plates and identifying details are blurred before publication.
        </p>
      </div>
    )
  }

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
