import { Link } from 'react-router-dom'
import { PageHero } from './PageHero'

export function LegalLinks({ className = '' }) {
  return (
    <span className={className}>
      <Link to="/privacy" className="hover:text-brand-300">
        Privacy Notice
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/terms" className="hover:text-brand-300">
        Terms of Service
      </Link>
    </span>
  )
}

export function LegalDocument({ eyebrow, title, description, updated, sections, children }) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} description={description} />
      <section className="section-pad">
        <div className="container-site grid gap-10 lg:grid-cols-[16rem_minmax(0,42rem)] lg:items-start">
          <nav className="lg:sticky lg:top-28" aria-label="On this page">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">On this page</p>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-ink-300 hover:text-brand-300">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article>
            <p className="text-sm text-ink-400">Last updated {updated}</p>
            <div className="mt-8 space-y-10">{children}</div>
          </article>
        </div>
      </section>
    </>
  )
}

export function LegalSection({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-2xl font-bold text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed text-ink-300">{children}</div>
    </section>
  )
}
