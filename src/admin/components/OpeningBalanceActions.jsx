import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { useAuth } from '../../contexts/AuthContext'
import { isStaffLike, canStaffEditOpeningBalance, VIEW_MODES } from '../../lib/authConfig'
import {
  clientOpeningBalanceAmount,
  clientOpeningBalanceDate,
} from '../../lib/clientRegistration'
import { opsApi } from '../../lib/opsApi'
import {
  autoAllocatePayment,
  invoiceBalanceDue,
  clientOpeningRemaining,
  openingBalanceRemaining,
} from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
} from '../ui'

/**
 * Shared brought-forward workflows (apply unapplied credit, apply B/F credit to
 * invoices, edit/clear). Paying toward positive B/F is done on Record payment
 * alongside invoices.
 */
export function useOpeningBalanceActions({ onDone } = {}) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEditOpening = (client) =>
    canStaffEditOpeningBalance(user, client?.id, VIEW_MODES.staff)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [saving, setSaving] = useState(false)

  const [applyCreditTarget, setApplyCreditTarget] = useState(null)
  const [invoiceTarget, setInvoiceTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  const [openInvoices, setOpenInvoices] = useState([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])

  const [applyAmount, setApplyAmount] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')

  const invoiceAllocations = useMemo(() => {
    if (!invoiceTarget) return { allocations: [], total: 0 }
    const credit = Math.abs(clientOpeningRemaining(invoiceTarget))
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

  async function finish() {
    if (typeof onDone === 'function') await onDone()
  }

  async function openApplyPayment(client) {
    const opening = clientOpeningRemaining(client)
    let credit = Math.round((Number(client.account_credit) || 0) * 100) / 100
    if (credit <= 0.001) {
      const creditRes = await opsApi.getClientCreditBalance(client.id)
      if (creditRes.error) {
        showError(creditRes.error.message)
        return
      }
      credit = Math.round((Number(creditRes.data?.balance) || 0) * 100) / 100
    }
    if (credit <= 0.001) {
      showWarning('This client has no unapplied payment to put toward brought forward.')
      return
    }
    setApplyCreditTarget({ ...client, account_credit: credit })
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

  function menuItemsFor(client, { includeEditWhenZero = true, compactLabels = false } = {}) {
    if (!client?.id) return []
    const remaining = clientOpeningRemaining(client)
    const original = clientOpeningBalanceAmount(client)
    const credit = Math.round((Number(client.account_credit) || 0) * 100) / 100
    const items = []

    if (remaining > 0) {
      // On Brought-forward list, jump to Record payment (B/F appears with invoices).
      // On Clients Accounts the page already has Record payment — skip duplicate.
      if (compactLabels) {
        items.push({
          label: 'Record payment',
          icon: 'payment',
          disabled: saving,
          onClick: () => navigate(`/admin/payments?client=${client.id}`),
        })
      }
      items.push({
        label:
          credit > 0.001
            ? compactLabels
              ? `Apply payment (${formatPula(credit)})`
              : `Apply payment to B/F (${formatPula(credit)})`
            : compactLabels
              ? 'Apply payment'
              : 'Apply payment to B/F',
        icon: 'check',
        disabled: saving,
        onClick: () => openApplyPayment(client),
      })
    } else if (remaining < 0) {
      items.push({
        label: compactLabels ? 'Apply to invoice' : 'Apply B/F credit to invoice',
        icon: 'invoice',
        disabled: saving,
        onClick: () => openApplyToInvoices(client),
      })
    }

    if (canEditOpening(client) && (original !== 0 || remaining !== 0 || includeEditWhenZero)) {
      items.push({
        label: compactLabels
          ? 'Edit balance'
          : original !== 0
            ? 'Edit opening balance'
            : 'Opening balance',
        icon: 'pencil',
        disabled: saving,
        onClick: () => openEditBalance(client),
      })
    }

    return items
  }

  async function submitApplyPayment(e) {
    e.preventDefault()
    if (!applyCreditTarget) return
    const opening = clientOpeningRemaining(applyCreditTarget)
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
    await finish()
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
    await finish()
  }

  async function saveOpeningBalance(client, opening, date) {
    const amount = Math.round((Number(opening) || 0) * 100) / 100
    if (amount !== 0 && !String(date || '').trim()) {
      showWarning('Choose an opening balance date when the amount is not zero.')
      return false
    }
    setSaving(true)
    const { error } = await opsApi.updateClientOpeningBalance(client.id, {
      opening_balance: amount,
      opening_balance_date: amount === 0 ? '' : date,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return false
    }
    return true
  }

  async function submitEditBalance(e) {
    e.preventDefault()
    if (!editTarget || !canEditOpening(editTarget)) return
    const ok = await saveOpeningBalance(editTarget, editAmount, editDate)
    if (!ok) return
    showSuccess('Brought-forward balance updated.')
    setEditTarget(null)
    await finish()
  }

  async function clearEditBalance() {
    if (!editTarget || !canEditOpening(editTarget)) return
    const original = clientOpeningBalanceAmount(editTarget)
    if (original === 0 && !clientOpeningBalanceDate(editTarget)) {
      showWarning('This client already has no brought-forward balance.')
      return
    }

    setSaving(true)
    const appliedRes = await opsApi.getClientOpeningBalanceApplied(editTarget.id)
    setSaving(false)
    if (appliedRes.error) {
      showError(appliedRes.error.message)
      return
    }

    const paidToward = Number(appliedRes.data?.paidTowardOpening) || 0
    const creditApplied = Number(appliedRes.data?.creditAppliedToInvoices) || 0
    const remaining = openingBalanceRemaining(original, appliedRes.data)
    let message = `Set ${editTarget.name}'s original opening balance to zero (currently ${formatPula(original)})?`

    if (paidToward > 0.001 || creditApplied > 0.001) {
      const parts = []
      if (paidToward > 0.001) {
        parts.push(`${formatPula(paidToward)} already paid toward brought forward`)
      }
      if (creditApplied > 0.001) {
        parts.push(`${formatPula(creditApplied)} credit already applied to invoices`)
      }
      message +=
        `\n\n${parts.join('; ')} will stay on the statement. Remaining is currently ${formatPula(remaining)} and will be recalculated from those records.`
    } else {
      message += ' This does not create a payment or change invoices.'
    }

    const ok = await confirm({
      title: 'Clear brought-forward balance?',
      message,
      confirmLabel: 'Clear balance',
    })
    if (!ok) return
    const saved = await saveOpeningBalance(editTarget, 0, '')
    if (!saved) return
    showSuccess('Brought-forward balance cleared.')
    setEditTarget(null)
    await finish()
  }

  function toggleInvoice(id) {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function selectAllInvoices() {
    setSelectedInvoiceIds(openInvoices.map((i) => i.id))
  }

  const dialogs = (
    <>
      {applyCreditTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitApplyPayment}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Apply payment — {applyCreditTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought forward remaining: {formatPula(clientOpeningRemaining(applyCreditTarget))}
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitApplyToInvoices}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Apply to invoices — {invoiceTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought-forward credit:{' '}
              {formatPula(Math.abs(clientOpeningRemaining(invoiceTarget)))}
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitEditBalance}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Edit opening balance — {editTarget.name}
            </h2>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Original brought-forward amount
              </span>
              <input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className={adminFieldClass}
              />
              <span className="mt-1 block text-xs text-ink-500">
                Positive = client owes. Negative = credit on account. Remaining after payments is
                calculated automatically
                {Math.abs(
                  clientOpeningRemaining(editTarget) - clientOpeningBalanceAmount(editTarget),
                ) > 0.001
                  ? ` (currently ${formatPula(clientOpeningRemaining(editTarget))})`
                  : ''}
                .
              </span>
            </label>
            <YearMonthDaySelect label="As of date" value={editDate} onChange={setEditDate} />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={clearEditBalance}
                className={adminBtnDanger}
              >
                Clear balance
              </button>
              <div className="flex gap-2">
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
            </div>
          </form>
        </div>
      ) : null}
    </>
  )

  return {
    saving,
    menuItemsFor,
    dialogs,
    openEditBalance,
  }
}
