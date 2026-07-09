import { CtaStrip } from '../components/CtaStrip'
import { Icon, TRACKED_ICONS } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { TRACKED_ITEMS } from '../data/site'

export default function WhatWeTrack() {
  return (
    <>
      <PageHero
        eyebrow="What we track"
        title="Assets you can protect with iTreq Inc"
        description="Our tracking solutions cover vehicles, solar systems, household valuables and business equipment — so you can monitor and recover what matters most."
      />

      <section className="section-pad">
        <div className="container-site">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKED_ITEMS.map((item, i) => (
              <div
                key={item.name}
                className="group rounded-2xl border border-white/10 bg-ink-900/40 p-6 transition duration-300 hover:border-brand-500/35 hover:bg-ink-800/50"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400 transition group-hover:bg-brand-500/20">
                  <Icon name={TRACKED_ICONS[i]} className="h-7 w-7" />
                </div>
                <h2 className="font-display text-xl font-semibold text-white">{item.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{item.blurb}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-2xl text-center text-ink-300">
            Have something else in mind? If it&apos;s valuable and trackable, talk to us —{' '}
            <span className="text-brand-300 italic">
              if it&apos;s under the sun, we&apos;ll locate it.
            </span>
          </p>
        </div>
      </section>

      <CtaStrip />
    </>
  )
}
