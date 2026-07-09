import { Icon } from './Icon'
import { RecoveryPhoto } from './RecoveryPhoto'
import { ASSET_ICONS, formatRecoveryDate } from '../data/recoveries'

export function RecoveryCard({ story }) {
  const iconName = ASSET_ICONS[story.assetType] || ASSET_ICONS.default

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-ink-900/50 ${
        story.isPlaceholder
          ? 'border-dashed border-white/20'
          : 'border-white/10'
      }`}
    >
      <RecoveryPhoto
        src={story.photo}
        alt={story.photo ? `${story.headline} recovery` : 'Recovery photo placeholder'}
        className="rounded-none border-0 border-b border-white/10"
      />

      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-azure-500/15 px-3 py-1 text-xs font-semibold text-azure-300">
            <Icon name={iconName} className="h-3.5 w-3.5" />
            {story.assetLabel}
          </span>
          {story.recoveredWithPolice && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-300">
              <Icon name="recovery" className="h-3.5 w-3.5" />
              With law enforcement
            </span>
          )}
          {story.isPlaceholder && (
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-ink-400">
              Awaiting your narrative
            </span>
          )}
        </div>

        <h2 className="mt-4 font-display text-xl font-bold text-white sm:text-2xl">
          {story.headline}
        </h2>

        <p className="mt-2 text-sm text-ink-400">
          {formatRecoveryDate(story.date)} · {story.location}
        </p>

        {story.policeUnits && (
          <p className="mt-1 text-xs text-ink-500">{story.policeUnits}</p>
        )}

        <p className="mt-4 text-sm leading-relaxed text-ink-300 sm:text-base">
          {story.summary}
        </p>

        {story.highlights?.length > 0 && (
          <ul className="mt-5 space-y-2">
            {story.highlights.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink-200">
                <span className="mt-0.5 shrink-0 text-brand-400">
                  <Icon name="check" className="h-4 w-4" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}
