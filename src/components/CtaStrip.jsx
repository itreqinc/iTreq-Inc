import { Button } from './Button'

export function CtaStrip({
  title = 'Need to protect your vehicle or valuable equipment?',
  description = 'Talk to iTreq Inc today about a tracking solution that fits your needs.',
}) {
  return (
    <section className="section-pad">
      <div className="container-site overflow-hidden rounded-3xl border border-azure-500/25 bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-6 py-12 sm:px-10 sm:py-14">
        <div className="relative">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-azure-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 left-10 h-36 w-36 rounded-full bg-brand-500/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h2>
            <p className="mt-3 text-ink-300">{description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/contact">Request a Quote</Button>
              <Button to="/services" variant="ghost">
                View Services
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
