import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import {
  contactSubmissionToForm,
  emptyClientForm,
} from '../../lib/clientRegistration'
import { validateClientForm } from '../../lib/clientValidation'
import { ClientRegistrationFields } from '../../components/ClientRegistrationFields'
import { ActionsMenu } from '../ActionsMenu'
import { useOpsAlert } from '../OpsAlertContext'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  activateRowKey,
  clickableRowClass,
  adminTableClass,
  adminColSecondary,
} from '../ui'

const STATUS_LABELS = {
  new: 'New',
  converted: 'Converted',
  dismissed: 'Dismissed',
}

function statusClass(status) {
  if (status === 'new') return 'text-amber-200'
  if (status === 'converted') return 'text-emerald-300'
  if (status === 'dismissed') return 'text-ink-400'
  return 'text-ink-300'
}

/** Prefer notes; fall back to legacy message / interest. */
function leadRequestText(lead) {
  const notes = String(lead?.notes || '').trim()
  if (notes) return notes
  const message = String(lead?.message || '').trim()
  const interest = String(lead?.interest || '').trim()
  if (interest && message) return `Interest: ${interest}\n\n${message}`
  return message || (interest ? `Interest: ${interest}` : '')
}

function LeadRowActions({ items, label = 'Lead actions' }) {
  return (
    <div
      className="inline-flex items-center justify-end"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ActionsMenu label={label} items={items} />
    </div>
  )
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('new')
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState(emptyClientForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await opsApi.listLeads(
      statusFilter === 'all' ? {} : { status: statusFilter },
    )
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setRows(data || [])
  }, [showError, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [r.name, r.email, r.cellphone, r.phone, r.id_number, r.notes, r.message]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [rows, searchQuery])

  const selectedLead = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId],
  )

  function startNew() {
    setSelectedId(null)
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(true)
    scrollToForm()
  }

  function startEdit(lead) {
    setSelectedId(lead.id)
    setEditingId(lead.id)
    setForm(contactSubmissionToForm(lead))
    setShowForm(true)
    scrollToForm()
  }

  function openLead(lead) {
    setShowForm(false)
    setEditingId(null)
    setSelectedId(lead.id)
  }

  function closeForm(savedId) {
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(false)
    if (savedId) {
      setSelectedId(savedId)
      highlightRow(savedId)
    }
  }

  function closeDetail() {
    setSelectedId(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const check = validateClientForm(form)
    if (!check.ok) {
      showWarning(check.message)
      return
    }

    setSaving(true)
    const res = editingId
      ? await opsApi.updateLead(editingId, form)
      : await opsApi.createLead(form)
    setSaving(false)

    if (res.error) {
      showError(res.error.message)
      return
    }

    showSuccess(editingId ? 'Lead updated.' : 'Lead added.')
    if (res.data?.id) setRows((prev) => upsertById(prev, res.data))
    closeForm(res.data?.id)
    if (!editingId) load()
  }

  async function handleConvert(lead) {
    const ok = await confirm({
      title: 'Convert to client?',
      message: `${lead.name} will be added to Clients. Linked quotations move with them.`,
      confirmLabel: 'Convert to client',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.convertLeadToClient(lead.id)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Lead converted to client.')
    setRows((prev) =>
      prev.map((r) =>
        r.id === lead.id
          ? { ...r, status: 'converted', converted_client_id: data?.id }
          : r,
      ),
    )
    if (data?.id) navigate(`/admin/clients?open=${data.id}`)
  }

  async function handleDismiss(lead) {
    const ok = await confirm({
      title: 'Dismiss this lead?',
      message: `${lead.name} will be marked dismissed.`,
      confirmLabel: 'Dismiss',
    })
    if (!ok) return

    const { data, error } = await opsApi.dismissLead(lead.id)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Lead dismissed.')
    if (statusFilter === 'new') {
      setRows((prev) => removeById(prev, lead.id))
      if (selectedId === lead.id) setSelectedId(null)
    } else if (data?.id) {
      setRows((prev) => upsertById(prev, data))
    }
  }

  async function handleDelete(lead) {
    const ok = await confirm({
      title: 'Delete this lead?',
      message: `Permanently delete ${lead.name}? This cannot be undone.`,
      confirmLabel: 'Delete lead',
    })
    if (!ok) return

    setDeletingId(lead.id)
    const { error } = await opsApi.deleteLead(lead.id)
    setDeletingId(null)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Lead deleted.')
    setRows((prev) => removeById(prev, lead.id))
    if (selectedId === lead.id) setSelectedId(null)
  }

  function createQuotation(lead) {
    navigate(`/admin/quotations?lead=${lead.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Leads</h1>
          <p className="mt-1 text-sm text-ink-300">
            Website enquiries — quote them, convert to a client, or dismiss.
          </p>
        </div>
        {!showForm ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            Add lead
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit lead' : 'New lead'}
            </h2>
            <button type="button" onClick={() => closeForm()} className={adminBtnSecondary}>
              Close
            </button>
          </div>
          <ClientRegistrationFields form={form} setForm={setForm} fieldClass={adminFieldClass} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={adminBtnPrimary}>
              {saving ? 'Saving…' : editingId ? 'Update lead' : 'Add lead'}
            </button>
            <button type="button" onClick={() => closeForm()} className={adminBtnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {selectedLead && !showForm ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Their request
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">
                {selectedLead.name}
              </h2>
              <p className="mt-1 text-sm text-ink-400">
                <span className={statusClass(selectedLead.status)}>
                  {STATUS_LABELS[selectedLead.status] || selectedLead.status}
                </span>
                {selectedLead.created_at
                  ? ` · ${String(selectedLead.created_at).slice(0, 10)}`
                  : ''}
              </p>
            </div>
            <button type="button" onClick={closeDetail} className={adminBtnSecondary}>
              Close
            </button>
          </div>

          <div className="rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-4 sm:p-5">
            {leadRequestText(selectedLead) ? (
              <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-100">
                {leadRequestText(selectedLead)}
              </p>
            ) : (
              <p className="text-sm text-ink-400">No request details were provided.</p>
            )}
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p className="text-ink-300">
              <span className="block text-xs uppercase tracking-wider text-ink-500">Phone</span>
              {selectedLead.cellphone || selectedLead.phone || '—'}
            </p>
            <p className="min-w-0 break-all text-ink-300">
              <span className="block text-xs uppercase tracking-wider text-ink-500">Email</span>
              {selectedLead.email || '—'}
            </p>
            <p className="text-ink-300">
              <span className="block text-xs uppercase tracking-wider text-ink-500">ID / Passport</span>
              {selectedLead.id_number || '—'}
            </p>
            {(selectedLead.physical_address || selectedLead.postal_address) && (
              <p className="text-ink-300 sm:col-span-2 lg:col-span-3">
                <span className="block text-xs uppercase tracking-wider text-ink-500">Address</span>
                {selectedLead.physical_address || selectedLead.postal_address}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {selectedLead.status === 'new' ? (
              <>
                <button
                  type="button"
                  onClick={() => createQuotation(selectedLead)}
                  className={adminBtnPrimary}
                >
                  Create quotation
                </button>
                <button
                  type="button"
                  onClick={() => handleConvert(selectedLead)}
                  disabled={saving}
                  className={adminBtnSecondary}
                >
                  Convert to client
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(selectedLead)}
                  className={adminBtnSecondary}
                >
                  Dismiss
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => startEdit(selectedLead)}
              className={adminBtnSecondary}
            >
              Edit details
            </button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search leads…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`${adminFieldClass} max-w-xs`}
        />
        <div className="inline-flex rounded-xl border border-white/10 bg-ink-900 p-0.5">
          {[
            { value: 'new', label: 'New' },
            { value: 'converted', label: 'Converted' },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'all', label: 'All' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === opt.value
                  ? 'bg-brand-500 text-ink-950'
                  : 'text-ink-300 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Request</th>
              <th className="px-4 py-3">Phone</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Email</th>
              <th className="px-4 py-3">Status</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Received</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  {rows.length === 0 ? 'No leads in this view.' : 'No leads match your search.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((lead) => {
                const open = () => openLead(lead)
                const isNew = lead.status === 'new'
                const requestPreview = leadRequestText(lead)
                const menuItems = [
                  { label: 'View request', onClick: () => openLead(lead) },
                  { label: 'Edit details', onClick: () => startEdit(lead) },
                  ...(isNew
                    ? [
                        { label: 'Create quotation', onClick: () => createQuotation(lead) },
                        { label: 'Convert to client', onClick: () => handleConvert(lead) },
                        { label: 'Dismiss', onClick: () => handleDismiss(lead) },
                      ]
                    : []),
                  ...(admin && lead.status !== 'converted'
                    ? [
                        {
                          label: deletingId === lead.id ? 'Deleting…' : 'Delete',
                          onClick: () => handleDelete(lead),
                          danger: true,
                          disabled: deletingId === lead.id,
                        },
                      ]
                    : []),
                ]

                return (
                  <tr
                    key={lead.id}
                    data-row-id={lead.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}${
                      selectedId === lead.id || highlightId === lead.id
                        ? ' ring-2 ring-amber-400/60'
                        : ''
                    }`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className="px-4 py-3 font-medium text-white">{lead.name}</td>
                    <td
                      className={`max-w-[14rem] truncate px-4 py-3 text-ink-300 ${adminColSecondary}`}
                      title={requestPreview || undefined}
                    >
                      {requestPreview || '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-300">{lead.cellphone || lead.phone || '—'}</td>
                    <td className={`min-w-0 break-all px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {lead.email || '—'}
                    </td>
                    <td className={`px-4 py-3 capitalize ${statusClass(lead.status)}`}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </td>
                    <td className={`px-4 py-3 text-ink-400 ${adminColSecondary}`}>
                      {lead.created_at ? String(lead.created_at).slice(0, 10) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <LeadRowActions items={menuItems} />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
