import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { CtaStrip } from '../components/CtaStrip'
import { Icon, SERVICE_ICONS, TRACKED_ICONS } from '../components/Icon'
import { COMPANY, SERVICES, TRACKED_ITEMS, WHY_US } from '../data/site'
import { RECOVERY_STORIES, formatRecoveryDate } from '../data/recoveries'

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_18%,rgba(32,128,208,0.22),transparent_48%),radial-gradient(ellipse_at_82%_12%,rgba(109,192,63,0.14),transparent_42%),linear-gradient(180deg,#050608_0%,#0a0e12_52%,#050608_100%)]" />
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
            }}
          />
          {/* Radar pulse */}
          <div className="absolute left-1/2 top-[42%] h-[min(70vw,520px)] w-[min(70vw,520px)] -translate-x-1/2 -translate-y-1/2">
            <span className="absolute inset-0 animate-ping rounded-full border border-azure-400/30 [animation-duration:3s]" />
            <span className="absolute inset-[15%] rounded-full border border-azure-500/20" />
            <span className="absolute inset-[30%] rounded-full border border-brand-500/20" />
            <span className="absolute inset-[45%] rounded-full border border-brand-400/25" />
            <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-azure-400 to-brand-400 shadow-[0_0_24px_rgba(32,128,208,0.7)]" />
          </div>
        </div>

        <div className="container-site relative flex min-h-[100svh] flex-col justify-center px-5 pb-20 pt-28 sm:px-8 lg:px-12">
          <p className="mb-4 animate-[fadeUp_0.7s_ease_both] text-sm font-semibold uppercase tracking-[0.22em] text-azure-400">
            {COMPANY.tagline}
          </p>
          <h1 className="max-w-4xl animate-[fadeUp_0.7s_0.08s_ease_both] font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.08]">
            Smart GPS Tracking for Vehicles, Equipment &{' '}
            <span className="text-gradient">Valuable Assets</span>
          </h1>
          <p className="mt-6 max-w-2xl animate-[fadeUp_0.7s_0.16s_ease_both] text-base leading-relaxed text-ink-300 sm:text-lg">
            From vehicles and fleet units to televisions, laptops, solar batteries and business
            equipment, iTreq Inc helps you monitor, protect and recover what matters.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 animate-[fadeUp_0.7s_0.24s_ease_both]">
            <Button to="/contact">Get a Quote</Button>
            <Button to="/contact" variant="secondary">
              Contact Us
            </Button>
            <Button to="/services" variant="ghost">
              View Services
            </Button>
          </div>
          <p className="mt-10 animate-[fadeUp_0.7s_0.32s_ease_both] font-display text-sm font-medium italic text-ink-400">
            {COMPANY.slogan}
          </p>
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(18px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </section>

      {/* Intro */}
      <section className="section-pad border-t border-white/5">
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
              Who we are
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
              Track, protect and recover what matters most
            </h2>
          </div>
          <p className="text-base leading-relaxed text-ink-300 sm:text-lg">
            iTreq Inc provides GPS tracking solutions for vehicles, household assets, business
            equipment, solar systems, batteries and more. Based in Gaborone, we deliver practical
            tracking and recovery support for individuals and businesses across Botswana — and
            beyond when cross-border visibility is needed.
          </p>
        </div>
      </section>

      {/* Services preview */}
      <section className="section-pad border-t border-white/5 bg-ink-900/40">
        <div className="container-site">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
                Services
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
                Protection that fits how you work
              </h2>
            </div>
            <Link
              to="/services"
              className="text-sm font-semibold text-brand-400 transition hover:text-brand-300"
            >
              All services →
            </Link>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((service) => (
              <Link
                key={service.id}
                to="/services"
                className="group rounded-2xl border border-white/10 bg-ink-950/60 p-6 transition duration-300 hover:border-brand-500/40 hover:bg-ink-800/60"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 transition group-hover:bg-brand-500/20">
                  <Icon name={SERVICE_ICONS[service.id]} />
                </div>
                <h3 className="font-display text-lg font-semibold text-white">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">{service.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* What we track */}
      <section className="section-pad border-t border-white/5">
        <div className="container-site">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
              What we track
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
              If it moves or matters, we can help you find it
            </h2>
            <p className="mt-4 text-ink-300">
              Vehicles, solar hardware, household valuables and business equipment — all under one
              practical tracking approach.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {TRACKED_ITEMS.map((item, i) => (
              <div
                key={item.name}
                className="flex flex-col items-center rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-5 text-center transition hover:border-brand-500/30 hover:bg-brand-500/5"
              >
                <div className="mb-3 text-brand-400">
                  <Icon name={TRACKED_ICONS[i]} className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-white">{item.name}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Button to="/what-we-track" variant="secondary">
              See full list
            </Button>
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="section-pad border-t border-white/5 bg-ink-900/40">
        <div className="container-site grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
              Why iTreq Inc
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
              Built for trust, clarity and recovery
            </h2>
            <p className="mt-4 text-ink-300">
              We focus on solutions that are easy to understand, practical to install, and useful
              when you need them most — whether you own one vehicle or manage a growing fleet.
            </p>
          </div>
          <ul className="space-y-3">
            {WHY_US.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl border border-white/8 bg-ink-950/50 px-4 py-3.5"
              >
                <span className="mt-0.5 text-brand-400">
                  <Icon name="check" className="h-5 w-5" />
                </span>
                <span className="text-sm text-ink-200 sm:text-base">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Success stories teaser */}
      <section className="section-pad border-t border-white/5">
        <div className="container-site overflow-hidden rounded-3xl border border-azure-500/20 bg-gradient-to-br from-ink-800/80 via-ink-900 to-ink-950 px-6 py-10 sm:px-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
                Our Success Stories — Highlights
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
                Recoveries documented with law enforcement
              </h2>
              <p className="mt-4 max-w-xl text-ink-300">
                When tracked assets are recovered, we document the outcome — shared responsibly with
                privacy in mind. Faces, plates and identifying details are blurred before anything
                is published.
              </p>
              <div className="mt-6">
                <Button to="/success-stories" variant="secondary">
                  View highlights
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              {RECOVERY_STORIES.slice(0, 2).map((story) => (
                <div
                  key={story.id}
                  className="rounded-2xl border border-white/10 bg-ink-950/50 px-5 py-4 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-400">
                    {story.assetLabel} · {formatRecoveryDate(story.date)}
                  </p>
                  <p className="mt-1 font-display text-sm font-semibold text-white">
                    {story.headline}
                  </p>
                </div>
              ))}
              <Link
                to="/success-stories"
                className="inline-block text-sm font-semibold text-brand-400 hover:text-brand-300"
              >
                Read all success stories →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CtaStrip />
    </>
  )
}
