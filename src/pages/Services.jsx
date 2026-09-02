import { Button } from '../components/Button'
import { CtaStrip } from '../components/CtaStrip'
import { Icon, SERVICE_ICONS } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { SERVICES } from '../data/site'

export default function Services() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="GPS tracking solutions for people and businesses"
        description="From a single vehicle to a full fleet, or household and business assets that need discreet protection — iTreq Inc offers tracking with practical recovery support."
      />

      <section className="section-pad">
        <div className="container-site space-y-8">
          {SERVICES.map((service, index) => (
            <article
              key={service.id}
              id={service.id}
              className={`grid gap-8 rounded-3xl border border-white/10 bg-ink-900/90 p-6 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-start ${
                index % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              <div>
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
                  <Icon name={SERVICE_ICONS[service.id]} className="h-7 w-7" />
                </div>
                <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                  {service.title}
                </h2>
                <p className="mt-3 text-ink-300">{service.description}</p>
                <div className="mt-6">
                  <Button to="/contact" className="!px-5 !py-2.5">
                    Get a Quote
                  </Button>
                </div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {service.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 rounded-xl border border-white/8 bg-ink-950/60 px-4 py-3"
                  >
                    <span className="mt-0.5 text-brand-400">
                      <Icon name="check" className="h-5 w-5" />
                    </span>
                    <span className="text-sm text-ink-200">{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <CtaStrip
        title="Not sure which service is right for you?"
        description="Tell us what you need to protect — we'll recommend a tracking setup that fits."
      />
    </>
  )
}
