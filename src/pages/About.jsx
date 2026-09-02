import { CtaStrip } from '../components/CtaStrip'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { COMPANY, WHY_US } from '../data/site'

const pillars = [
  {
    title: 'Our mission',
    text: 'To give individuals and businesses practical ways to monitor, protect and recover the assets they rely on every day.',
  },
  {
    title: 'Our focus',
    text: 'Clear tracking visibility, reliable installation, and support when recovery matters — without unnecessary complexity.',
  },
  {
    title: 'Where we serve',
    text: 'Based in Gaborone, Botswana, with solutions suited to local needs and cross-border vehicle monitoring when required.',
  },
]

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="About us"
        title="Protecting valuable assets with practical tracking"
        description={`iTreq Inc is a GPS tracking company built to help people and businesses keep eyes on what matters — from cars and fleets to solar systems and household valuables.`}
      />

      <section className="section-pad">
        <div className="container-site grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div>
            <h2 className="font-display text-3xl font-bold text-white">Who we are</h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-ink-300">
              <p>
                iTreq Inc exists to make asset protection more accessible. Whether you need to
                track a personal vehicle, monitor a small fleet, or secure high-value equipment
                like solar batteries and generators, we provide tracking solutions designed for
                real everyday use.
              </p>
              <p>
                Theft, misuse and loss are real risks for households and businesses. Our approach
                is simple: install dependable tracking, give you clear visibility, and stand ready
                to support recovery when a tracked asset goes missing.
              </p>
              <p>
                We serve personal clients, fleet operators, and businesses that need practical
                protection — with local service rooted in Gaborone and reach that extends when
                vehicles cross borders.
              </p>
            </div>

            <blockquote className="mt-8 border-l-2 border-azure-500 pl-5">
              <p className="font-display text-xl font-semibold italic text-azure-300 sm:text-2xl">
                {COMPANY.slogan}
              </p>
            </blockquote>
          </div>

          <div className="space-y-4">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-white/10 bg-ink-900/90 p-5"
              >
                <h3 className="font-display text-lg font-semibold text-white">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{pillar.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad border-t border-white/5 bg-ink-900/90">
        <div className="container-site">
          <h2 className="font-display text-3xl font-bold text-white">Why trust iTreq Inc</h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {WHY_US.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-ink-950/50 px-4 py-3.5"
              >
                <span className="mt-0.5 text-brand-400">
                  <Icon name="check" className="h-5 w-5" />
                </span>
                <span className="text-sm text-ink-200">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaStrip
        title="Ready to protect what matters?"
        description="Reach out for a quote — we'll help you choose the right tracking solution."
      />
    </>
  )
}
