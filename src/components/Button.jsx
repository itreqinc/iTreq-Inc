import { Link } from 'react-router-dom'

export function Button({
  children,
  to,
  href,
  variant = 'primary',
  className = '',
  type = 'button',
  onClick,
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400'

  const variants = {
    primary:
      'bg-brand-500 text-ink-950 shadow-[0_0_24px_rgba(109,192,63,0.28)] hover:bg-brand-400 hover:shadow-[0_0_32px_rgba(109,192,63,0.45)] active:scale-[0.98]',
    secondary:
      'border border-azure-500/45 bg-azure-500/10 text-azure-300 backdrop-blur hover:border-azure-400/60 hover:bg-azure-500/20 hover:text-azure-200',
    ghost:
      'border border-white/15 bg-white/5 text-white hover:border-white/25 hover:bg-white/10',
  }

  const classes = `${base} ${variants[variant]} ${className}`

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {children}
      </Link>
    )
  }

  if (href) {
    return (
      <a href={href} className={classes} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
        {children}
      </a>
    )
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  )
}
