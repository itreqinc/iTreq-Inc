import { useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { COMPANY } from '../data/site'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const contactCards = [
  {
    icon: 'phone',
    label: 'Phone',
    value: COMPANY.phone,
    href: `tel:${COMPANY.phone.replace(/\s/g, '')}`,
  },
  {
    icon: 'mail',
    label: 'Email',
    value: COMPANY.email,
    href: `mailto:${COMPANY.email}`,
  },
  {
    icon: 'phone',
    label: 'WhatsApp',
    value: COMPANY.whatsappDisplay,
    href: `https://wa.me/${COMPANY.whatsapp.replace('+', '')}`,
  },
  {
    icon: 'pin',
    label: 'Location',
    value: COMPANY.location,
    href: null,
  },
  {
    icon: 'clock',
    label: 'Business hours',
    value: COMPANY.hours,
    href: null,
  },
]

export default function Contact() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    interest: 'Vehicle GPS Tracking',
    message: '',
  })

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!isSupabaseConfigured || !supabase) {
      setError(
        'Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.',
      )
      return
    }

    setSubmitting(true)
    const { error: insertError } = await supabase.from('contact_submissions').insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      interest: form.interest,
      message: form.message.trim(),
    })
    setSubmitting(false)

    if (insertError) {
      setError('Something went wrong sending your message. Please try again or WhatsApp us.')
      return
    }

    setSubmitted(true)
  }

  const fieldClass =
    'w-full rounded-xl border border-white/10 bg-ink-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-ink-500 focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20'

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to iTreq Inc about a tracking solution"
        description="Request a quote, ask about installation, or tell us what you need to protect. We’ll get back to you as soon as we can."
      />

      <section className="section-pad">
        <div className="container-site grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            {contactCards.map((card) => (
              <div
                key={card.label}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-ink-900/50 p-5"
              >
                <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <Icon name={card.icon} className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    {card.label}
                  </p>
                  {card.href ? (
                    <a
                      href={card.href}
                      target={card.href.startsWith('http') ? '_blank' : undefined}
                      rel={card.href.startsWith('http') ? 'noreferrer' : undefined}
                      className="mt-1 block text-base font-medium text-white hover:text-brand-300"
                    >
                      {card.value}
                    </a>
                  ) : (
                    <p className="mt-1 text-base font-medium text-white">{card.value}</p>
                  )}
                </div>
              </div>
            ))}

            <a
              href={COMPANY.facebook}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300"
            >
              Visit us on Facebook →
            </a>
          </div>

          <div className="rounded-3xl border border-white/10 bg-ink-900/50 p-6 sm:p-8">
            {submitted ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                  <Icon name="check" className="h-7 w-7" />
                </div>
                <h2 className="font-display text-2xl font-bold text-white">Message received</h2>
                <p className="mt-3 max-w-sm text-ink-300">
                  Thanks for reaching out. We’ve saved your request and will follow up as soon as
                  we can.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button href={`mailto:${COMPANY.email}`}>Email us</Button>
                  <Button
                    href={`https://wa.me/${COMPANY.whatsapp.replace('+', '')}`}
                    variant="secondary"
                  >
                    WhatsApp
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="font-display text-2xl font-bold text-white">Request a quote</h2>
                <p className="text-sm text-ink-300">
                  Fill in your details and we&apos;ll follow up with options for your needs.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-1">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Name
                    </span>
                    <input
                      required
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      className={fieldClass}
                      placeholder="Your name"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Phone
                    </span>
                    <input
                      required
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      className={fieldClass}
                      placeholder="+267 ..."
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Email
                  </span>
                  <input
                    required
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    className={fieldClass}
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Interested in
                  </span>
                  <select
                    name="interest"
                    value={form.interest}
                    onChange={handleChange}
                    className={fieldClass}
                  >
                    <option>Vehicle GPS Tracking</option>
                    <option>Asset Tracking</option>
                    <option>Fleet Monitoring</option>
                    <option>Recovery Support</option>
                    <option>Not sure yet</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Message
                  </span>
                  <textarea
                    required
                    name="message"
                    rows={4}
                    value={form.message}
                    onChange={handleChange}
                    className={`${fieldClass} resize-y`}
                    placeholder="Tell us what you'd like to track..."
                  />
                </label>

                {error ? (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
