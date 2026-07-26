import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { NAV_LINKS } from '../data/site'
import { useAuth } from '../contexts/AuthContext'
import { ROLES, normalizeRole } from '../lib/authConfig'
import { Logo } from './Logo'
import { Button } from './Button'

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user } = useAuth()

  const account = user
    ? {
        to: normalizeRole(user.role) === ROLES.client ? '/portal' : '/admin',
        label: normalizeRole(user.role) === ROLES.client ? 'My portal' : 'Ops',
      }
    : { to: '/login', label: 'Sign in' }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition duration-300 ${
        scrolled || open
          ? 'border-b border-white/10 bg-ink-950/90 backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <div className="container-site flex items-center justify-between gap-3 px-2 py-3 max-md:max-w-none sm:px-8 sm:py-4 lg:px-12">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          aria-label="iTreq Inc home"
          className="max-md:-ml-1 max-md:scale-[1.08] max-md:origin-left max-md:drop-shadow-[0_12px_28px_rgba(32,128,208,0.35)] sm:scale-100 sm:drop-shadow-[0_10px_22px_rgba(32,128,208,0.22)] transition-transform duration-300"
        >
          <Logo className="h-14 max-md:h-[3.4rem] sm:h-14" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-azure-500/15 text-azure-300'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            to={account.to}
            className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-white"
          >
            {account.label}
          </Link>
          <Button to="/contact" className="!px-5 !py-2.5">
            Get a Quote
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <div className="flex w-5 flex-col gap-1.5">
            <span
              className={`h-0.5 w-full bg-current transition ${open ? 'translate-y-2 rotate-45' : ''}`}
            />
            <span className={`h-0.5 w-full bg-current transition ${open ? 'opacity-0' : ''}`} />
            <span
              className={`h-0.5 w-full bg-current transition ${open ? '-translate-y-2 -rotate-45' : ''}`}
            />
          </div>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-ink-950/98 px-2 pb-6 pt-2 sm:px-5 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-base font-medium ${
                    isActive ? 'bg-azure-500/15 text-azure-300' : 'text-ink-200'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 space-y-2">
            <Button
              to={account.to}
              variant="ghost"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              {account.label}
            </Button>
            <Button to="/contact" className="w-full" onClick={() => setOpen(false)}>
              Get a Quote
            </Button>
          </div>
        </div>
      )}
    </header>
  )
}
