import { useCallback, useEffect, useMemo, useState } from 'react'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import {
  clientOpeningBalanceAmount,
  clientOpeningBalanceDate,
  clientToForm,
} from '../../lib/clientRegistration'
import { opsApi } from '../../lib/opsApi'
import {
  autoAllocatePayment,
  invoiceBalanceDue,
  localTodayIso,
  PAYMENT_METHODS,
} from '../../lib/payments'
import { ActionsMenu } from '../ActionsMenu'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableClass,
  adminColSecondary,
  formatPula,
} from '../ui'

function balanceTone(amount) {
  const n = Number(amount) || 0
  if (n > 0) return 'text-amber-200'
  if (n < 0) return 'text-emerald-200'
  return 'text-ink-300'
}

/**
 * Clients with a non-zero brought-forward balance.
 */
export function OpeningBalancesPanel({ ownClientId }) {
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [payTarget, setPayTarget] = useState(null)
  const [applyCreditTarget, setApplyCreditTarget] = useState(null)
  const [invoiceTarget, setInvoiceTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  const [openInvoices, setOpenInvoices] = useState([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])

  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: '',
    method: 'cash',
    reference: '',
    notes: '',
  })
  const [applyAmount, setApplyAmount] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await opsApi.listOpeningBalanceClients({ activeOnly: true })
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setRows((data || []).filter((c) => String(c.id) !== String(ownClientId || '')))
  }, [ownClientId, showError])

  useEffect(() => {
    load()
  }, [load])

  const invoiceAllocations = useMemo(() => {
    if (!invoiceTarget) return { allocations: [], total: 0 }
    const credit = Math.abs(clientOpeningBalanceAmount(invoiceTarget))
    const { allocations, remaining } = autoAllocatePayment(
      credit,
      openInvoices,
      selectedInvoiceIds,
    )
    const list = selectedInvoiceIds
      .map((id) => {
        const inv = openInvoices.find((i) => i.id === id)
        const amount = Math.round((Number(allocations[id]) || 0) * 100) / 100
        return inv && amount > 0
          ? { invoice_id: id, amount, number: inv.number, due: invoiceBalanceDue(inv) }
          : null
      })
      .filter(Boolean)
    const total = Math.round(list.reduce((s, a) => s + a.amount, 0) * 100) / 100
    return { allocations: list, total, unused: remaining }
  }, [invoiceTarget, openInvoices, selectedInvoiceIds])

  function openRecordPayment(client) {
    const opening = clientOpeningBalanceAmount(client)
    setPayTarget(client)
    setPayForm({
      amount: String(opening),
      payment_date: localTodayIso(),
      method: 'cash',
      reference: '',
      notes: '',
    })
  }

  function openApplyPayment(client) {
    const opening = clientOpeningBalanceAmount(client)
    const credit = Math.round((Number(client.account_credit) || 0) * 100) / 100
    setApplyCreditTarget(client)
    setApplyAmount(String(Math.min(opening, credit)))
  }

  async function openApplyToInvoices(client) {
    setInvoiceTarget(client)
    setSelectedInvoiceIds([])
    setOpenInvoices([])
    const { data, error } = await opsApi.listOpenInvoicesForClient(client.id)
    if (error) {
      showError(error.message)
      setInvoiceTarget(null)
      return
    }
    const open = (data || []).filter((inv) => invoiceBalanceDue(inv) > 0.001)
    setOpenInvoices(open)
    if (!open.length) {
      showWarning('This client has no unpaid or partial invoices.')
      setInvoiceTarget(null)
    }
  }

  function openEditBalance(client) {
    const amount = clientOpeningBalanceAmount(client)
    setEditTarget(client)
    setEditAmount(amount === 0 ? '0' : String(amount))
    setEditDate(clientOpeningBalanceDate(client) || '')
  }

  function rowMenuItems(row) {
    const opening = clientOpeningBalanceAmount(row)
    const credit = Math.round((Number(row.account_credit) || 0) * 100) / 100
    const items = []

    if (opening > 0) {
      items.push({
        label: 'Record payment',
        icon: 'payment',
        disabled: saving,
        onClick: () => openRecordPayment(row),
      })
      if (credit > 0.001) {
        items.push({
          label: `Apply payment (${formatPula(credit)})`,
          icon: 'check',
          disabled: saving,
          onClick: () => openApplyPayment(row),
        })
      }
    } else if (opening < 0) {
      items.push({
        label: 'Apply to invoice',
        icon: 'invoice',
        disabled: saving,
        onClick: () => openApplyToInvoices(row),
      })
    }

    if (admin) {
      items.push({
        label: 'Edit balance',
        icon: 'pencil',
        disabled: saving,
        onClick: () => openEditBalance(row),
      })
    }

    return items
  }

  async function submitRecordPayment(e) {
    e.preventDefault()
    if (!payTarget) return
    const amount = Math.round((Number(payForm.amount) || 0) * 100) / 100
    const opening = clientOpeningBalanceAmount(payTarget)
    if (amount <= 0) {
      showError('Enter a payment amount greater than zero.')
      return
    }
    if (amount > opening + 0.001) {
      showError(`Amount cannot exceed the brought-forward balance (${formatPula(opening)}).`)
      return
    }
    const ok = await confirm({
      title: 'Record payment to brought forward?',
      message: `Record ${formatPula(amount)} against ${payTarget.name}'s brought-forward balance.`,
      confirmLabel: 'Record payment',
    })
    if (!ok) return

    setSaving(true)
    const { error } = await opsApi.applyPaymentToOpeningBalance({
      client_id: payTarget.id,
      amount,
      payment_date: payForm.payment_date || localTodayIso(),
      method: payForm.method || 'cash',
      reference: payForm.reference || null,
      notes: payForm.notes || null,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Payment recorded against brought-forward balance.')
    setPayTarget(null)
    await load()
  }

  async function submitApplyPayment(e) {
    e.preventDefault()
    if (!applyCreditTarget) return
    const opening = clientOpeningBalanceAmount(applyCreditTarget)
    const credit = Math.round((Number(applyCreditTarget.account_credit) || 0) * 100) / 100
    let amount = Math.round((Number(applyAmount) || 0) * 100) / 100
    if (amount <= 0) amount = Math.min(opening, credit)
    amount = Math.min(amount, opening, credit)
    if (amount <= 0) {
      showError('Nothing to apply.')
      return
    }
    const ok = await confirm({
      title: 'Apply unapplied payment?',
      message: `Apply ${formatPula(amount)} of unapplied payment to ${applyCreditTarget.name}'s brought-forward balance.`,
      confirmLabel: 'Apply payment',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.applyClientCreditToOpeningBalance(
      applyCreditTarget.id,
      amount,
    )
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Applied ${formatPula(data?.applied || amount)} to brought forward.`)
    setApplyCreditTarget(null)
    await load()
  }

  async function submitApplyToInvoices(e) {
    e.preventDefault()
    if (!invoiceTarget) return
    const { allocations, total } = invoiceAllocations
    if (!allocations.length) {
      showError('Select at least one invoice.')
      return
    }
    const ok = await confirm({
      title: 'Apply brought-forward credit?',
      message: `Apply ${formatPula(total)} across ${allocations.length} invoice${allocations.length === 1 ? '' : 's'} for ${invoiceTarget.name}.`,
      confirmLabel: 'Apply to invoices',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.applyOpeningCreditToInvoices(
      invoiceTarget.id,
      allocations.map((a) => ({ invoice_id: a.invoice_id, amount: a.amount })),
    )
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Applied ${formatPula(data?.applied || total)} to invoice(s).`)
    setInvoiceTarget(null)
    await load()
  }

  async function submitEditBalance(e) {
    e.preventDefault()
    if (!editTarget || !admin) return
    const opening = Math.round((Number(editAmount) || 0) * 100) / 100
    if (opening !== 0 && !String(editDate || '').trim()) {
      showWarning('Choose an opening balance date when the amount is not zero.')
      return
    }

    const formPayload = {
      ...clientToForm(editTarget),
      opening_balance: opening === 0 ? '0' : String(opening),
      opening_balance_date: opening === 0 ? '' : editDate,
    }

    setSaving(true)
    const { error } = await opsApi.updateClient(editTarget.id, formPayload)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Brought-forward balance updated.')
    setEditTarget(null)
    await load()
  }

  function toggleInvoice(id) {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function selectAllInvoices() {
    setSelectedInvoiceIds(openInvoices.map((i) => i.id))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Clients with a remaining brought-forward balance. Positive amounts are still owed; negative
        amounts are credit you can apply to invoices.
      </p>

      <table className={adminTableClass}>
        <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            <th className="px-4 py-3">Client</th>
            <th className={`px-4 py-3 ${adminColSecondary}`}>As of</th>
            <th className="px-4 py-3 text-right">Brought forward</th>
            <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Unapplied</th>
            <th className="px-4 py-3 w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-ink-400">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-ink-400">
                No unpaid brought-forward balances.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const opening = clientOpeningBalanceAmount(row)
              const asOf = clientOpeningBalanceDate(row)
              const credit = Math.round((Number(row.account_credit) || 0) * 100) / 100
              return (
                <tr key={row.id} className="bg-ink-900/20">
                  <td className="px-4 py-3 text-sm font-medium text-white">{row.name}</td>
                  <td className={`px-4 py-3 text-sm text-ink-400 ${adminColSecondary}`}>
                    {asOf || '—'}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${balanceTone(opening)}`}
                  >
                    {formatPula(opening)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm tabular-nums text-ink-400 ${adminColSecondary}`}
                  >
                    {credit > 0.001 ? formatPula(credit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ActionsMenu
                      label={`Actions for ${row.name}`}
                      items={rowMenuItems(row)}
                    />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {payTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitRecordPayment}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Record payment — {payTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought forward: {formatPula(clientOpeningBalanceAmount(payTarget))}
            </p>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Amount *
              </span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={payForm.amount}
                onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                className={adminFieldClass}
              />
            </label>
            <YearMonthDaySelect
              label="Payment date"
              value={payForm.payment_date}
              onChange={(payment_date) => setPayForm((f) => ({ ...f, payment_date }))}
            />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Method</span>
              <select
                value={payForm.method}
                onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                className={adminFieldClass}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Reference
              </span>
              <input
                value={payForm.reference}
                onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                className={adminFieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
              <input
                value={payForm.notes}
                onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                className={adminFieldClass}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPayTarget(null)}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={adminBtnPrimary}>
                {saving ? 'Saving…' : 'Record payment'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {applyCreditTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitApplyPayment}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Apply payment — {applyCreditTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought forward: {formatPula(clientOpeningBalanceAmount(applyCreditTarget))}
              <br />
              Unapplied payment: {formatPula(applyCreditTarget.account_credit)}
            </p>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Amount to apply *
              </span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={applyAmount}
                onChange={(e) => setApplyAmount(e.target.value)}
                className={adminFieldClass}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setApplyCreditTarget(null)}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={adminBtnPrimary}>
                {saving ? 'Applying…' : 'Apply payment'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {invoiceTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitApplyToInvoices}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Apply to invoices — {invoiceTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought-forward credit: {formatPula(Math.abs(clientOpeningBalanceAmount(invoiceTarget)))}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wider text-ink-400">Open invoices</p>
              <button
                type="button"
                onClick={selectAllInvoices}
                className="text-xs font-medium text-brand-300 hover:text-brand-200"
              >
                Select all
              </button>
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
              {openInvoices.map((inv) => {
                const due = invoiceBalanceDue(inv)
                const checked = selectedInvoiceIds.includes(inv.id)
                const applied = invoiceAllocations.allocations.find((a) => a.invoice_id === inv.id)
                return (
                  <li key={inv.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        onChange={() => toggleInvoice(inv.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">
                          {inv.number || 'Invoice'}
                        </span>
                        <span className="block text-xs text-ink-400">
                          Due {formatPula(due)}
                          {applied ? ` · applying ${formatPula(applied.amount)}` : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="text-sm text-ink-300">
              Total to apply:{' '}
              <span className="font-semibold tabular-nums text-white">
                {formatPula(invoiceAllocations.total)}
              </span>
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setInvoiceTarget(null)}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || invoiceAllocations.total <= 0}
                className={adminBtnPrimary}
              >
                {saving ? 'Applying…' : 'Apply to invoices'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitEditBalance}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Edit balance — {editTarget.name}
            </h2>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Brought-forward amount
              </span>
              <input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className={adminFieldClass}
              />
              <span className="mt-1 block text-xs text-ink-500">
                Positive = client owes. Negative = credit on account.
              </span>
            </label>
            <YearMonthDaySelect
              label="As of date"
              value={editDate}
              onChange={setEditDate}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditTarget(null)}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className={adminBtnPrimary}>
                {saving ? 'Saving…' : 'Save balance'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
