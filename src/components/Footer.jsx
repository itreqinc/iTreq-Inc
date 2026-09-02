import { Link } from 'react-router-dom'
import { COMPANY, NAV_LINKS } from '../data/site'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-900/92 backdrop-blur-md">
      <div className="container-site section-pad !py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo className="h-16" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-300">
              GPS tracking solutions for vehicles, household assets, business equipment,
              solar systems, batteries and more.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-azure-400">
              {COMPANY.tagline}
            </p>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white">
              Explore
            </h3>
            <ul className="mt-4 space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-300 transition hover:text-brand-300"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white">
              Contact
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-ink-300">
              <li>
                <a href={`tel:${COMPANY.phone.replace(/\s/g, '')}`} className="hover:text-brand-300">
                  {COMPANY.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${COMPANY.email}`} className="hover:text-brand-300">
                  {COMPANY.email}
                </a>
              </li>
              <li>{COMPANY.location}</li>
              <li>
                <a
                  href={COMPANY.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-300"
                >
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {COMPANY.name}. All rights reserved.</p>
          <p>Serving Botswana and beyond.</p>
        </div>
      </div>
    </footer>
  )
}
