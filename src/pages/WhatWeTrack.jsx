import { useEffect, useId, useState } from 'react'
import { CtaStrip } from '../components/CtaStrip'
import { Icon, TRACKED_ICONS } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { TRACKED_ITEMS } from '../data/site'

export default function WhatWeTrack() {
  const [openName, setOpenName] = useState(null)
  const panelId = useId()

  useEffect(() => {
    if (!openName) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setOpenName(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openName])

  function toggle(name) {
    setOpenName((prev) => (prev === name ? null : name))
  }

  return (
    <>
      <PageHero
        eyebrow="What we track"
        title="Assets you can protect with iTreq Inc"
        description="Our tracking solutions cover vehicles, solar systems, household valuables and business equipment — so you can monitor and recover what matters most."
      />

      <section className="section-pad">
        <div className="container-site relative">
          {openName ? (
            <button
              type="button"
              aria-label="Close details"
              className="fixed inset-0 z-40 cursor-default bg-ink-950/35 backdrop-blur-[2px] transition-opacity duration-300"
              onClick={() => setOpenName(null)}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKED_ITEMS.map((item, i) => {
              const isOpen = openName === item.name
              return (
                <div
                  key={item.name}
                  className={`relative ${isOpen ? 'z-50' : 'z-0'}`}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? `${panelId}-${i}` : undefined}
                    onClick={() => toggle(item.name)}
                    className={`group relative z-20 w-full rounded-2xl border p-6 text-left transition duration-300 ${
                      isOpen
                        ? 'border-brand-500/50 bg-ink-800 shadow-lg shadow-black/40'
                        : 'border-white/10 bg-ink-900/90 hover:border-brand-500/35 hover:bg-ink-800/50'
                    }`}
                  >
                    <div
                      className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                        isOpen
                          ? 'bg-brand-500/20 text-brand-300'
                          : 'bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20'
                      }`}
                    >
                      <Icon name={TRACKED_ICONS[i]} className="h-7 w-7" />
                    </div>
                    <h2 className="font-display text-xl font-semibold text-white">{item.name}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-ink-300">{item.blurb}</p>
                    <p
                      className={`mt-3 text-xs font-semibold uppercase tracking-wider transition ${
                        isOpen ? 'text-brand-300' : 'text-ink-500 group-hover:text-brand-400'
                      }`}
                    >
                      {isOpen ? 'Close' : 'Why track this →'}
                    </p>
                  </button>

                  <div
                    id={`${panelId}-${i}`}
                    role="region"
                    aria-hidden={!isOpen}
                    className={`pointer-events-none absolute inset-x-0 top-[calc(100%-0.85rem)] z-10 origin-top transition duration-300 ease-out ${
                      isOpen
                        ? 'pointer-events-auto translate-y-0 opacity-100'
                        : 'invisible -translate-y-6 opacity-0'
                    }`}
                  >
                    <div className="rounded-2xl border border-brand-500/30 bg-ink-900 pt-8 shadow-2xl shadow-black/50">
                      <div className="border-t border-white/5 px-5 pb-5 pt-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">
                          Why it pays to track
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-ink-200">{item.benefit}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
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
