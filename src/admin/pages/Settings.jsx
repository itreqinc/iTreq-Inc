import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { COMPANY } from '../../data/site'
import { emptyDocumentSettingsFields } from '../../lib/companyDocumentSettings'
import {
  COLLAPSE_BODY_CLASS,
  useCollapseIntoView,
} from '../../lib/collapseIntoView'
import { opsApi, sortExpenseCategories } from '../../lib/opsApi'
import { useOpsAlert } from '../OpsAlertContext'
import { AdminIconAction } from '../AdminIconAction'
import { AfterHoursPanel } from '../components/AfterHoursPanel'
import { PaydaySettingsPanel } from '../components/PaydaySettingsPanel'
import { adminFieldClass, adminFieldReadonlyClass } from '../ui'

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
  'max-w-xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5'

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300 ease-in-out ${
        open ? 'rotate-90' : 'rotate-0'
      }`}
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ActionIcon({ d }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  pencil: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  trash:
    'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  ban: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  checkCircle:
    'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  check: 'M4.5 12.75l6 6 9-13.5',
  x: 'M6 18L18 6M6 6l12 12',
  plus: 'M12 4.5v15m7.5-7.5h-15',
}

function IconAction({ label, onClick, disabled, tone = 'default', children }) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
      : tone === 'muted'
        ? 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
        : 'text-brand-400 hover:bg-brand-500/10 hover:text-brand-300'

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`group/iconTip relative inline-flex rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-ink-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover/iconTip:opacity-100 group-focus-visible/iconTip:opacity-100"
      >
        {label}
      </span>
    </button>
  )
}

function CollapsibleSection({
  id,
  open,
  onToggle,
  title,
  description,
  children,
  className = sectionClass,
  headerEnd,
}) {
  const panelId = useId()
  const rootRef = useRef(null)
  useCollapseIntoView(open, rootRef)

  return (
    <section ref={rootRef} className={className}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(id)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronIcon open={open} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">{title}</span>
            {description ? (
              <span className="mt-1 block text-xs text-ink-400">{description}</span>
            ) : null}
          </span>
        </button>
        {headerEnd}
      </div>
      <div
        id={panelId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`space-y-3 pt-3 ${open ? COLLAPSE_BODY_CLASS : 'pointer-events-none'}`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

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

const SECTION_FIELDS = {
  letterhead: [
    'company_name',
    'letterhead_address',
    'letterhead_phone',
    'letterhead_email',
    'banking_details',
  ],
  currency: ['currency', 'default_tax_rate'],
  numbering: [
    'quote_prefix',
    'invoice_prefix',
    'next_quote_number',
    'next_invoice_number',
  ],
}

function snapshotSection(form, sectionId) {
  const full = JSON.parse(snapshotSettingsForm(form))
  const keys = SECTION_FIELDS[sectionId] || []
  const slice = {}
  for (const key of keys) slice[key] = full[key]
  return JSON.stringify(slice)
}

function formFromSnapshot(json) {
  if (!json) return { ...empty }
  try {
    return { ...empty, ...JSON.parse(json) }
  } catch {
    return { ...empty }
  }
}

function SectionEditActions({ editing, dirty, saving, onEdit, onCancel, onSave }) {
  if (!editing) {
    return (
      <div className="pt-1">
        <AdminIconAction label="Edit" icon="pencil" onClick={onEdit} />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 pt-1">
      <AdminIconAction
        label="Cancel"
        icon="x"
        tone="muted"
        disabled={saving}
        onClick={onCancel}
      />
      <AdminIconAction
        label={saving ? 'Saving…' : 'Save'}
        icon="check"
        disabled={saving || !dirty}
        onClick={onSave}
      />
    </div>
  )
}

function fieldClass(editable, extra = '') {
  return `${editable ? adminFieldClass : adminFieldReadonlyClass}${extra ? ` ${extra}` : ''}`
}

export default function SettingsPage() {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [form, setForm] = useState(empty)
  const [baseline, setBaseline] = useState('')
  const [editingSection, setEditingSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [catName, setCatName] = useState('')
  const [catSaving, setCatSaving] = useState(false)
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [openSection, setOpenSection] = useState(null)
  const [companyOpen, setCompanyOpen] = useState(false)

  const sectionDirty = useMemo(() => {
    if (!editingSection || !baseline) return false
    const base = formFromSnapshot(baseline)
    return snapshotSection(form, editingSection) !== snapshotSection(base, editingSection)
  }, [editingSection, form, baseline])

  async function discardIfNeeded() {
    if (!editingSection) return true
    if (sectionDirty) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'Your edits will be lost.',
        confirmLabel: 'Discard',
      })
      if (!ok) return false
    }
    setForm(formFromSnapshot(baseline))
    setEditingSection(null)
    return true
  }

  async function toggleSection(id) {
    if (openSection === id) {
      const ok = await discardIfNeeded()
      if (!ok) return
      setOpenSection(null)
      return
    }
    if (editingSection && editingSection !== id) {
      const ok = await discardIfNeeded()
      if (!ok) return
    }
    setOpenSection(id)
  }

  async function toggleCompany() {
    if (companyOpen) {
      const ok = await discardIfNeeded()
      if (!ok) return
      setOpenSection(null)
      setCompanyOpen(false)
      return
    }
    setCompanyOpen(true)
  }

  async function addCategory() {
    if (catSaving || !catName.trim()) return
    setCatSaving(true)
    const { data, error } = await opsApi.saveExpenseCategory({
      name: catName,
      sort_order: (categories.length + 1) * 10,
      active: true,
    })
    setCatSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    setCatName('')
    setCategories((prev) => sortExpenseCategories([...prev, { ...data, in_use: false }]))
    showSuccess('Category added.')
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [settingsRes, catRes] = await Promise.all([
      opsApi.getSettings(),
      opsApi.listExpenseCategories({ activeOnly: false, withUsage: true }),
    ])
    setLoading(false)
    if (settingsRes.error) {
      showError(settingsRes.error.message)
      return
    }
    if (catRes.error) showError(catRes.error.message)
    else setCategories(catRes.data || [])

    const data = settingsRes.data
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
      setEditingSection(null)
    }
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  async function startEdit(sectionId) {
    if (editingSection && editingSection !== sectionId) {
      const ok = await discardIfNeeded()
      if (!ok) return
    }
    setEditingSection(sectionId)
  }

  async function cancelEdit() {
    const ok = await discardIfNeeded()
    if (!ok) return
  }

  async function saveSection(sectionId) {
    if (editingSection !== sectionId || !sectionDirty) return

    const ok = await confirm({
      title: 'Save settings?',
      message:
        'These details are used on quotations, invoices, and document numbering. Save your changes?',
      confirmLabel: 'Save',
    })
    if (!ok) return

    setSaving(true)
    const { error: err } = await opsApi.updateSettings(form)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    setBaseline(snapshotSettingsForm(form))
    setEditingSection(null)
    showSuccess('Settings saved.')
  }

  if (loading) {
    return <p className="text-sm text-ink-400">Loading settings…</p>
  }

  const letterheadEditing = editingSection === 'letterhead'
  const currencyEditing = editingSection === 'currency'
  const numberingEditing = editingSection === 'numbering'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-ink-300">
          Company details for quotes and invoices, plus document numbering.
        </p>
      </div>

      <CollapsibleSection
        id="company"
        open={companyOpen}
        onToggle={toggleCompany}
        title="Company document settings"
        description="Letterhead, banking, currency, tax, and quote / invoice numbering."
      >
        <div className="space-y-3">
          <CollapsibleSection
            id="letterhead"
            open={openSection === 'letterhead'}
            onToggle={toggleSection}
            className="rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4"
            title="Quote & invoice letterhead"
            description={
              <>
                Shown under your logo on printed and emailed estimates and invoices. Logo is the site
                image at <span className="text-ink-300">/logo.png</span>.
              </>
            }
          >
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Legal / display name
              </span>
              <input
                readOnly={!letterheadEditing}
                className={fieldClass(letterheadEditing)}
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
                readOnly={!letterheadEditing}
                rows={3}
                className={fieldClass(letterheadEditing, 'resize-y')}
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
                  readOnly={!letterheadEditing}
                  className={fieldClass(letterheadEditing)}
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
                  readOnly={!letterheadEditing}
                  type="email"
                  className={fieldClass(letterheadEditing)}
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
                readOnly={!letterheadEditing}
                rows={5}
                className={fieldClass(letterheadEditing, 'resize-y')}
                value={form.banking_details}
                onChange={(e) => setForm((f) => ({ ...f, banking_details: e.target.value }))}
                placeholder={'Account name\nBank name\nBranch\nACC: …'}
              />
              <span className="mt-1 block text-xs text-ink-500">
                One line per row; appears in the banking box at the bottom of each document.
              </span>
            </label>
            <SectionEditActions
              editing={letterheadEditing}
              dirty={letterheadEditing && sectionDirty}
              saving={saving}
              onEdit={() => startEdit('letterhead')}
              onCancel={cancelEdit}
              onSave={() => saveSection('letterhead')}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="currency"
            open={openSection === 'currency'}
            onToggle={toggleSection}
            className="rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4"
            title="Currency & tax"
            description="Default currency for amounts on quotes and invoices, plus the tax rate applied unless you override it on a document."
          >
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Currency code
              </span>
              <input
                readOnly={!currencyEditing}
                className={fieldClass(currencyEditing)}
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
                readOnly={!currencyEditing}
                type="number"
                min="0"
                step="0.01"
                className={fieldClass(currencyEditing)}
                value={form.default_tax_rate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, default_tax_rate: Number(e.target.value) }))
                }
              />
            </label>
            <SectionEditActions
              editing={currencyEditing}
              dirty={currencyEditing && sectionDirty}
              saving={saving}
              onEdit={() => startEdit('currency')}
              onCancel={cancelEdit}
              onSave={() => saveSection('currency')}
            />
          </CollapsibleSection>

          <CollapsibleSection
            id="numbering"
            open={openSection === 'numbering'}
            onToggle={toggleSection}
            className="rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4"
            title="Document numbering"
            description="Prefixes and next numbers used when creating new quotes and invoices."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Quote prefix
                </span>
                <input
                  readOnly={!numberingEditing}
                  className={fieldClass(numberingEditing)}
                  value={form.quote_prefix}
                  onChange={(e) => setForm((f) => ({ ...f, quote_prefix: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Next quote #
                </span>
                <input
                  readOnly={!numberingEditing}
                  type="number"
                  min="1"
                  className={fieldClass(numberingEditing)}
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
                  readOnly={!numberingEditing}
                  className={fieldClass(numberingEditing)}
                  value={form.invoice_prefix}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Next invoice #
                </span>
                <input
                  readOnly={!numberingEditing}
                  type="number"
                  min="1"
                  className={fieldClass(numberingEditing)}
                  value={form.next_invoice_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, next_invoice_number: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
            <SectionEditActions
              editing={numberingEditing}
              dirty={numberingEditing && sectionDirty}
              saving={saving}
              onEdit={() => startEdit('numbering')}
              onCancel={cancelEdit}
              onSave={() => saveSection('numbering')}
            />
          </CollapsibleSection>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="categories"
        open={openSection === 'categories'}
        onToggle={toggleSection}
        title="Expense categories"
        description="Add, rename, or remove categories used when recording expenses. Categories already used on expenses cannot be deleted — deactivate them instead."
      >
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {categories.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-400">No categories yet.</li>
          ) : (
            categories.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                  c.active ? '' : 'opacity-50'
                }`}
              >
                {editingCatId === c.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    <input
                      className={`${adminFieldClass} min-w-0 flex-1`}
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingCatId(null)
                          setEditingCatName('')
                        }
                      }}
                    />
                    <IconAction
                      label="Save"
                      disabled={catSaving || !editingCatName.trim()}
                      onClick={async () => {
                        setCatSaving(true)
                        const { data, error } = await opsApi.saveExpenseCategory({
                          id: c.id,
                          name: editingCatName,
                          sort_order: c.sort_order,
                          active: c.active,
                        })
                        setCatSaving(false)
                        if (error) {
                          showError(error.message)
                          return
                        }
                        setCategories((prev) =>
                          sortExpenseCategories(
                            prev.map((row) =>
                              row.id === data.id
                                ? { ...data, in_use: row.in_use }
                                : row,
                            ),
                          ),
                        )
                        setEditingCatId(null)
                        setEditingCatName('')
                        showSuccess('Category updated.')
                      }}
                    >
                      <ActionIcon d={ICONS.check} />
                    </IconAction>
                    <IconAction
                      label="Cancel"
                      tone="muted"
                      disabled={catSaving}
                      onClick={() => {
                        setEditingCatId(null)
                        setEditingCatName('')
                      }}
                    >
                      <ActionIcon d={ICONS.x} />
                    </IconAction>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-ink-200">
                      {c.name}
                      {!c.active ? (
                        <span className="ml-2 text-xs text-ink-500">inactive</span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <IconAction
                        label="Edit"
                        disabled={catSaving}
                        onClick={() => {
                          setEditingCatId(c.id)
                          setEditingCatName(c.name)
                        }}
                      >
                        <ActionIcon d={ICONS.pencil} />
                      </IconAction>
                      <IconAction
                        label={c.active ? 'Deactivate' : 'Activate'}
                        disabled={catSaving}
                        onClick={async () => {
                          setCatSaving(true)
                          const { data, error } = await opsApi.saveExpenseCategory({
                            id: c.id,
                            name: c.name,
                            sort_order: c.sort_order,
                            active: !c.active,
                          })
                          setCatSaving(false)
                          if (error) {
                            showError(error.message)
                            return
                          }
                          setCategories((prev) =>
                            prev.map((row) =>
                              row.id === data.id
                                ? { ...data, in_use: row.in_use }
                                : row,
                            ),
                          )
                        }}
                      >
                        <ActionIcon d={c.active ? ICONS.ban : ICONS.checkCircle} />
                      </IconAction>
                      {!c.in_use ? (
                        <IconAction
                          label="Delete"
                          tone="danger"
                          disabled={catSaving}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Delete category?',
                              message: `Delete “${c.name}”?`,
                              confirmLabel: 'Delete',
                            })
                            if (!ok) return
                            setCatSaving(true)
                            const { error } = await opsApi.deleteExpenseCategory(c.id)
                            setCatSaving(false)
                            if (error) {
                              showError(error.message)
                              return
                            }
                            setCategories((prev) => prev.filter((row) => row.id !== c.id))
                            if (editingCatId === c.id) {
                              setEditingCatId(null)
                              setEditingCatName('')
                            }
                            showSuccess('Category deleted.')
                          }}
                        >
                          <ActionIcon d={ICONS.trash} />
                        </IconAction>
                      ) : null}
                    </div>
                  </>
                )}
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${adminFieldClass} min-w-0 flex-1`}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="New category name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCategory()
              }
            }}
          />
          <IconAction
            label="Add category"
            disabled={catSaving || !catName.trim()}
            onClick={addCategory}
          >
            <ActionIcon d={ICONS.plus} />
          </IconAction>
        </div>
      </CollapsibleSection>

      <AfterHoursPanel />
      <PaydaySettingsPanel />
    </div>
  )
}
