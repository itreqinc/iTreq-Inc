import { useState } from 'react'
import { CtaStrip } from '../components/CtaStrip'
import { PageHero } from '../components/PageHero'
import { RecoveryCard } from '../components/RecoveryCard'
import { RecoveryProcess } from '../components/RecoveryProcess'
import { ASSET_FILTERS, RECOVERY_STORIES } from '../data/recoveries'

export default function SuccessStories() {
  const [filter, setFilter] = useState('all')

  const stories =
    filter === 'all'
      ? RECOVERY_STORIES
      : RECOVERY_STORIES.filter((s) => s.assetType === filter)

  return (
    <>
      <PageHero
        eyebrow="Our Success Stories — Highlights"
        title="Documented recoveries with law enforcement support"
        description="A public record of tracked assets we have helped locate and recover — shared with care for client privacy. Faces, registration plates and identifying details are never published without being blurred first."
      />

      <RecoveryProcess />

      <section className="section-pad">
        <div className="container-site">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
                Recovery highlights
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
                Real outcomes from tracked assets
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {ASSET_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    filter === item.id
                      ? 'bg-azure-500/20 text-azure-300'
                      : 'border border-white/10 text-ink-300 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {stories.length > 0 ? (
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {stories.map((story) => (
                <RecoveryCard key={story.id} story={story} />
              ))}
            </div>
          ) : (
            <p className="mt-10 rounded-2xl border border-dashed border-white/20 bg-ink-900/40 px-6 py-12 text-center text-ink-300">
              No stories in this category yet. Share your recovery narratives and we will add the
              highlights here.
            </p>
          )}

          <p className="mx-auto mt-12 max-w-2xl text-center text-sm leading-relaxed text-ink-400">
            Stories are published in summary form only. We do not share client names, exact
            addresses, registration numbers or open case details on this page.
          </p>
        </div>
      </section>

      <CtaStrip
        title="Tracking works best before you need recovery"
        description="Fit a device now so iTreq Inc can support you — and law enforcement — if an asset ever goes missing."
      />
    </>
  )
}
