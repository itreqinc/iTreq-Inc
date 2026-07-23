import { useCallback, useEffect, useMemo, useState } from 'react'
import { COMPANY } from '../../data/site'
import { emptyDocumentSettingsFields } from '../../lib/companyDocumentSettings'
import { opsApi } from '../../lib/opsApi'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../ui'

const empty = {
  company_name: 'iTreq Inc',
  currency: 'BWP',
  quote_prefix: 'Q',
  invoice_prefix: 'INV',
  next_quote_number: 1,
  next_invoice_number: 1,
  default_tax_rate: 0,
  ...emptyDocumentSettingsFields,
}

const sectionClass =
  'max-w-xl space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5'

function snapshotSettingsForm(form) {
  return JSON.stringify({
    company_name: String(form.company_name ?? '').trim(),
    currency: String(form.currency ?? '').trim(),
    quote_prefix: String(form.quote_prefix ?? '').trim(),
    invoice_prefix: String(form.invoice_prefix ?? '').trim(),
    next_quote_number: Number(form.next_quote_number) || 1,
    next_invoice_number: Number(form.next_invoice_number) || 1,
    default_tax_rate: Number(form.default_tax_rate) || 0,
    letterhead_address: String(form.letterhead_address ?? '').trim(),
    letterhead_phone: String(form.letterhead_phone ?? '').trim(),
    letterhead_email: String(form.letterhead_email ?? '').trim(),
    banking_details: String(form.banking_details ?? '').trim(),
  })
}

function formFromSnapshot(json) {
  if (!json) return { ...empty }
  try {
    return { ...empty, ...JSON.parse(json) }
  } catch {
    return { ...empty }
  }
}

export default function SettingsPage() {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [form, setForm] = useState(empty)
  const [baseline, setBaseline] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isDirty = useMemo(
    () => editing && snapshotSettingsForm(form) !== baseline,
    [editing, form, baseline],
  )

  const readOnly = !editing

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await opsApi.getSettings()
    setLoading(false)
    if (err) {
      showError(err.message)
      return
    }
    if (data) {
      const next = {
        company_name: data.company_name ?? empty.company_name,
        currency: data.currency ?? empty.currency,
        quote_prefix: data.quote_prefix ?? empty.quote_prefix,
        invoice_prefix: data.invoice_prefix ?? empty.invoice_prefix,
        next_quote_number: data.next_quote_number ?? empty.next_quote_number,
        next_invoice_number: data.next_invoice_number ?? empty.next_invoice_number,
        default_tax_rate: data.default_tax_rate ?? empty.default_tax_rate,
        letterhead_address: data.letterhead_address ?? '',
        letterhead_phone: data.letterhead_phone ?? '',
        letterhead_email: data.letterhead_email ?? '',
        banking_details: data.banking_details ?? '',
      }
      setForm(next)
      setBaseline(snapshotSettingsForm(next))
      setEditing(false)
    }
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  function startEdit() {
    setEditing(true)
  }

  async function cancelEdit() {
    if (isDirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'Your edits to settings will be lost.',
        confirmLabel: 'Discard',
      })
      if (!ok) return
    }
    setForm(formFromSnapshot(baseline))
    setEditing(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!editing || !isDirty) return

    const ok = await confirm({
      title: 'Save settings?',
      message:
        'These details are used on quotations, invoices, and document numbering. Save your changes?',
      confirmLabel: 'Save settings',
    })
    if (!ok) return

    setSaving(true)
    const { error: err } = await opsApi.updateSettings(form)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    const snap = snapshotSettingsForm(form)
    setBaseline(snap)
    setEditing(false)
    showSuccess('Settings saved.')
  }

  if (loading) {
    return <p className="text-sm text-ink-400">Loading settings…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-ink-300">
            Company details for quotes and invoices, plus document numbering.
          </p>
        </div>
        {!editing ? (
          <button type="button" onClick={startEdit} className={adminBtnPrimary}>
            Edit settings
          </button>
        ) : (
          <button type="button" onClick={cancelEdit} disabled={saving} className={adminBtnSecondary}>
            Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className={sectionClass}>
          <div>
            <h2 className="text-sm font-semibold text-white">Quote &amp; invoice letterhead</h2>
            <p className="mt-1 text-xs text-ink-400">
              Shown under your logo on printed and emailed estimates and invoices. Logo is the site
              image at <span className="text-ink-300">/logo.png</span>.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Legal / display name
            </span>
            <input
              readOnly={readOnly}
              className={adminFieldClass}
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="iTreq Inc"
            />
            <span className="mt-1 block text-xs text-ink-500">
              Used for accessibility on the logo and in email subjects—not printed as a heading.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Address
            </span>
            <textarea
              readOnly={readOnly}
              rows={3}
              className={`${adminFieldClass} resize-y`}
              value={form.letterhead_address}
              onChange={(e) => setForm((f) => ({ ...f, letterhead_address: e.target.value }))}
              placeholder={`One line per row, e.g.\n${COMPANY.location}`}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Contact phone
              </span>
              <input
                readOnly={readOnly}
                className={adminFieldClass}
                value={form.letterhead_phone}
                onChange={(e) => setForm((f) => ({ ...f, letterhead_phone: e.target.value }))}
                placeholder={COMPANY.phone}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Email
              </span>
              <input
                readOnly={readOnly}
                type="email"
                className={adminFieldClass}
                value={form.letterhead_email}
                onChange={(e) => setForm((f) => ({ ...f, letterhead_email: e.target.value }))}
                placeholder={COMPANY.email}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Banking details
            </span>
            <textarea
              readOnly={readOnly}
              rows={5}
              className={`${adminFieldClass} resize-y`}
              value={form.banking_details}
              onChange={(e) => setForm((f) => ({ ...f, banking_details: e.target.value }))}
              placeholder={'Account name\nBank name\nBranch\nACC: …'}
            />
            <span className="mt-1 block text-xs text-ink-500">
              One line per row; appears in the banking box at the bottom of each document.
            </span>
          </label>
        </section>

        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-white">Currency &amp; tax</h2>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Currency code
            </span>
            <input
              readOnly={readOnly}
              className={adminFieldClass}
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            />
            <p className="mt-1 text-xs text-ink-500">
              Use BWP for Botswana Pula — amounts display as P everywhere.
            </p>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Default tax rate (%)
            </span>
            <input
              readOnly={readOnly}
              type="number"
              min="0"
              step="0.01"
              className={adminFieldClass}
              value={form.default_tax_rate}
              onChange={(e) => setForm((f) => ({ ...f, default_tax_rate: Number(e.target.value) }))}
            />
          </label>
        </section>

        <section className={sectionClass}>
          <h2 className="text-sm font-semibold text-white">Document numbering</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Quote prefix
              </span>
              <input
                readOnly={readOnly}
                className={adminFieldClass}
                value={form.quote_prefix}
                onChange={(e) => setForm((f) => ({ ...f, quote_prefix: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Next quote #
              </span>
              <input
                readOnly={readOnly}
                type="number"
                min="1"
                className={adminFieldClass}
                value={form.next_quote_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, next_quote_number: Number(e.target.value) }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Invoice prefix
              </span>
              <input
                readOnly={readOnly}
                className={adminFieldClass}
                value={form.invoice_prefix}
                onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Next invoice #
              </span>
              <input
                readOnly={readOnly}
                type="number"
                min="1"
                className={adminFieldClass}
                value={form.next_invoice_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, next_invoice_number: Number(e.target.value) }))
                }
              />
            </label>
          </div>
        </section>

        {editing ? (
          <button
            type="submit"
            disabled={saving || !isDirty}
            title={!isDirty ? 'Change something before saving' : undefined}
            className={adminBtnPrimary}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        ) : null}
      </form>
    </div>
  )
}
