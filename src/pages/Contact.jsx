import { useState } from 'react'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { PageHero } from '../components/PageHero'
import { ClientRegistrationFields } from '../components/ClientRegistrationFields'
import { COMPANY } from '../data/site'
import { emptyClientForm, formToContactSubmissionRow } from '../lib/clientRegistration'
import { validateClientForm } from '../lib/clientValidation'
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
  const [form, setForm] = useState(emptyClientForm)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const request = String(form.notes || '').trim()
    if (!request) {
      setError('Tell us what you need tracked — a short note is enough to get started.')
      return
    }

    const check = validateClientForm(form)
    if (!check.ok) {
      setError(check.message)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('A database is not configured yet. Please contact the administrator.')
      return
    }

    setSubmitting(true)
    const row = formToContactSubmissionRow(form)
    const { error: insertError } = await supabase.from('contact_submissions').insert({
      ...row,
      phone: row.phone || row.cellphone,
      notes: request,
      interest: null,
      message: request,
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
        description="Request a quote or tell us what you need to protect — we’ll get back to you soon."
      />

      <section className="section-pad">
        <div className="container-site grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            {contactCards.map((card) => (
              <div
                key={card.label}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-ink-900/90 p-5"
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

          <div className="rounded-3xl border border-white/10 bg-ink-900/90 p-6 sm:p-8">
            {submitted ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                  <Icon name="check" className="h-7 w-7" />
                </div>
                <h2 className="font-display text-2xl font-bold text-white">Request received</h2>
                <p className="mt-3 max-w-sm text-ink-300">
                  Thanks — we’ve got your details and will follow up soon.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button href={`mailto:${COMPANY.email}`}>Email us</Button>
                  <Button
                    href={`https://wa.me/${COMPANY.whatsapp.replace('+', '')}`}
                    variant="special"
                  >
                    WhatsApp
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">Request a quote</h2>
                  <p className="mt-1 text-sm text-ink-300">Tell us what you need — we’ll take it from there.</p>
                </div>

                <div className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.07] p-4 sm:p-5">
                  <label className="block">
                    <span className="font-display text-lg font-semibold text-white">
                      What do you need tracked?
                    </span>
                    <span className="mt-1 block text-sm text-ink-300">
                      Vehicles, solar, livestock, tools — be specific so we can quote accurately.
                    </span>
                    <textarea
                      required
                      rows={5}
                      className={`${fieldClass} mt-3 resize-y border-brand-500/20 bg-ink-950/70 placeholder:text-ink-500`}
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Example: Three bakkies and a trailer for our fleet in Gaborone, plus two solar arrays at the yard…"
                    />
                  </label>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Your details
                  </p>
                  <ClientRegistrationFields
                    form={form}
                    setForm={setForm}
                    fieldClass={fieldClass}
                    showNotes={false}
                  />
                </div>

                {error ? (
                  <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Submit request'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
