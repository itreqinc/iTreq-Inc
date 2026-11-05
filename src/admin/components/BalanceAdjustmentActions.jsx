import { useEffect, useMemo, useState } from 'react'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { opsApi } from '../../lib/opsApi'
import {
  OPENING_BALANCE_ALLOC_ID,
  autoAllocatePayment,
  clientOpeningRemaining,
  invoiceBalanceDue,
  localTodayIso,
} from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
} from '../ui'

/**
 * Admin-only write-off: amount to subtract or target balance (mutually exclusive),
 * manual invoice / B/F selection like Record payment.
 */
export function useBalanceAdjustmentActions({ onDone } = {}) {
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [saving, setSaving] = useState(false)
  const [target, setTarget] = useState(null)

  const [adjustmentDate, setAdjustmentDate] = useState(localTodayIso())
  const [subtractAmount, setSubtractAmount] = useState('')
  const [targetBalance, setTargetBalance] = useState('')
  const [activeField, setActiveField] = useState(null) // 'subtract' | 'target'
  const [reason, setReason] = useState('')
  const [asOfBalance, setAsOfBalance] = useState(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  const [openInvoices, setOpenInvoices] = useState([])
  const [openingDue, setOpeningDue] = useState(0)
  const [selectedIds, setSelectedIds] = useState([])

  const creditAmount = useMemo(() => {
    const asOf = Math.round((Number(asOfBalance) || 0) * 100) / 100
    if (activeField === 'target') {
      const targetVal = Math.round((Number(targetBalance) || 0) * 100) / 100
      if (!Number.isFinite(targetVal) || String(targetBalance).trim() === '') return 0
      return Math.round((asOf - targetVal) * 100) / 100
    }
    return Math.round((Number(subtractAmount) || 0) * 100) / 100
  }, [activeField, subtractAmount, targetBalance, asOfBalance])

  const allocationTargets = useMemo(() => {
    const targets = []
    if (openingDue > 0.001) {
      targets.push({
        id: OPENING_BALANCE_ALLOC_ID,
        number: 'Brought forward',
        _allocatable: openingDue,
        _isOpening: true,
      })
    }
    for (const inv of openInvoices) targets.push(inv)
    return targets
  }, [openingDue, openInvoices])

  const { allocations, remaining } = useMemo(
    () => autoAllocatePayment(Math.max(0, creditAmount), allocationTargets, selectedIds),
    [creditAmount, allocationTargets, selectedIds],
  )

  const allocationTotal = useMemo(
    () =>
      Math.round(
        Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0) * 100,
      ) / 100,
    [allocations],
  )

  const openingAllocated =
    Math.round((Number(allocations[OPENING_BALANCE_ALLOC_ID]) || 0) * 100) / 100

  const invoiceAllocations = useMemo(
    () =>
      Object.entries(allocations)
        .filter(([id, amount]) => id !== OPENING_BALANCE_ALLOC_ID && Number(amount) > 0)
        .map(([invoice_id, amount]) => ({
          invoice_id,
          amount: Math.round((Number(amount) || 0) * 100) / 100,
        })),
    [allocations],
  )

  const newBalance = useMemo(() => {
    const asOf = Math.round((Number(asOfBalance) || 0) * 100) / 100
    return Math.round((asOf - Math.max(0, creditAmount)) * 100) / 100
  }, [asOfBalance, creditAmount])

  const validationError = useMemo(() => {
    if (!target) return ''
    const asOf = Math.round((Number(asOfBalance) || 0) * 100) / 100
    if (loadingBalance || asOfBalance == null) return ''
    if (!String(reason || '').trim()) return 'Enter a reason for this adjustment.'
    if (creditAmount <= 0.001) {
      if (activeField === 'target') {
        return 'Target balance must be below the balance as of the chosen date.'
      }
      return 'Enter an amount to subtract greater than zero.'
    }
    if (creditAmount > asOf + 0.001) {
      return `Cannot subtract ${formatPula(creditAmount)}; balance as of ${adjustmentDate} is ${formatPula(asOf)}.`
    }
    if (activeField === 'target') {
      const targetVal = Math.round((Number(targetBalance) || 0) * 100) / 100
      if (targetVal < -0.001) return 'Target balance cannot be negative.'
      if (targetVal >= asOf - 0.001) {
        return 'Target balance must be less than the balance as of the chosen date.'
      }
    }
    return ''
  }, [
    target,
    asOfBalance,
    loadingBalance,
    reason,
    creditAmount,
    activeField,
    adjustmentDate,
    targetBalance,
  ])

  async function finish() {
    if (typeof onDone === 'function') await onDone()
  }

  async function refreshAsOfBalance(clientId, date) {
    if (!clientId || !date) {
      setAsOfBalance(null)
      return
    }
    setLoadingBalance(true)
    const { data, error } = await opsApi.getClientBalanceAsOf(clientId, date)
    setLoadingBalance(false)
    if (error) {
      showError(error.message)
      setAsOfBalance(null)
      return
    }
    setAsOfBalance(Math.round((Number(data?.balance) || 0) * 100) / 100)
  }

  async function openAdjust(client) {
    if (!admin) {
      showWarning('Only admins can adjust account balances.')
      return
    }
    if (!client?.id) return
    const today = localTodayIso()
    setTarget(client)
    setAdjustmentDate(today)
    setSubtractAmount('')
    setTargetBalance('')
    setActiveField(null)
    setReason('')
    setSelectedIds([])
    setOpenInvoices([])
    setOpeningDue(0)
    setAsOfBalance(null)

    const [invRes, balRes] = await Promise.all([
      opsApi.listOpenInvoicesForClient(client.id),
      opsApi.getClientBalanceAsOf(client.id, today),
    ])
    if (invRes.error) {
      showError(invRes.error.message)
      setTarget(null)
      return
    }
    if (balRes.error) {
      showError(balRes.error.message)
      setTarget(null)
      return
    }

    const open = (invRes.data || []).filter((inv) => invoiceBalanceDue(inv) > 0.001)
    setOpenInvoices(open)
    setAsOfBalance(Math.round((Number(balRes.data?.balance) || 0) * 100) / 100)

    const remaining = clientOpeningRemaining(client)
    setOpeningDue(remaining > 0.001 ? remaining : 0)
  }

  useEffect(() => {
    if (!target?.id || !adjustmentDate) return
    refreshAsOfBalance(target.id, adjustmentDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when date/client change
  }, [target?.id, adjustmentDate])

  function onSubtractChange(value) {
    setActiveField(value.trim() ? 'subtract' : null)
    setSubtractAmount(value)
    if (value.trim()) setTargetBalance('')
  }

  function onTargetChange(value) {
    setActiveField(value.trim() ? 'target' : null)
    setTargetBalance(value)
    if (value.trim()) setSubtractAmount('')
  }

  function toggleId(id, checked) {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    )
  }

  function selectAll() {
    setSelectedIds(allocationTargets.map((t) => t.id))
  }

  async function submit(e) {
    e.preventDefault()
    if (!target?.id || saving) return
    if (validationError) {
      showWarning(validationError)
      return
    }
    const asOf = Math.round((Number(asOfBalance) || 0) * 100) / 100
    const ok = await confirm({
      title: 'Adjust account balance?',
      message: `Write off ${formatPula(creditAmount)} for ${target.name}. Balance as of ${adjustmentDate}: ${formatPula(asOf)} → ${formatPula(newBalance)}.`,
      confirmLabel: 'Adjust balance',
    })
    if (!ok) return

    setSaving(true)
    const { error } = await opsApi.createBalanceAdjustment({
      client_id: target.id,
      amount: creditAmount,
      adjustment_date: adjustmentDate,
      reason: String(reason).trim(),
      notes: null,
      allocations: invoiceAllocations,
      opening_amount: openingAllocated,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Balance adjusted by ${formatPula(creditAmount)}.`)
    setTarget(null)
    await finish()
  }

  function menuItemsFor(client) {
    if (!admin || !client?.id) return []
    return [
      {
        label: 'Adjust balance',
        icon: 'pencil',
        disabled: saving,
        onClick: () => openAdjust(client),
      },
    ]
  }

  const dialogs = target ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
      >
        <h2 className="font-display text-lg font-semibold text-white">
          Adjust balance — {target.name}
        </h2>
        <p className="text-sm text-ink-400">
          Balance as of {adjustmentDate}:{' '}
          <span className="font-semibold tabular-nums text-white">
            {loadingBalance || asOfBalance == null ? '…' : formatPula(asOfBalance)}
          </span>
          {creditAmount > 0.001 ? (
            <>
              {' '}
              → credit {formatPula(creditAmount)} →{' '}
              <span className="font-semibold tabular-nums text-white">
                {formatPula(newBalance)}
              </span>
            </>
          ) : null}
        </p>

        <YearMonthDaySelect
          label="Adjustment date"
          value={adjustmentDate}
          onChange={setAdjustmentDate}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Amount to subtract
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={subtractAmount}
              disabled={activeField === 'target'}
              onChange={(e) => onSubtractChange(e.target.value)}
              className={adminFieldClass}
              placeholder="e.g. 7000"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Target balance
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={targetBalance}
              disabled={activeField === 'subtract'}
              onChange={(e) => onTargetChange(e.target.value)}
              className={adminFieldClass}
              placeholder="e.g. 500"
            />
          </label>
        </div>
        <p className="text-xs text-ink-500">
          Fill only one field. With target balance, invoices are settled by the difference
          (current as-of balance minus target), not the target figure itself.
        </p>

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Reason *
          </span>
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={adminFieldClass}
            placeholder="Goodwill, dispute, migration cleanup…"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-ink-400">
            Apply to (optional)
          </p>
          {allocationTargets.length ? (
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              Select all
            </button>
          ) : null}
        </div>
        {allocationTargets.length === 0 ? (
          <p className="text-sm text-ink-400">
            No open invoices or brought-forward balance to settle. The credit still reduces
            the account balance.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
            {allocationTargets.map((row) => {
              const due = Number(row._allocatable ?? invoiceBalanceDue(row)) || 0
              const checked = selectedIds.includes(row.id)
              const applied = Number(allocations[row.id]) || 0
              return (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => toggleId(row.id, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-white">
                        {row.number || 'Invoice'}
                      </span>
                      <span className="block text-xs text-ink-400">
                        Due {formatPula(due)}
                        {applied > 0.001 ? ` · applying ${formatPula(applied)}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {creditAmount > 0.001 ? (
          <p className="text-sm text-ink-300">
            Allocating{' '}
            <span className="font-semibold tabular-nums text-white">
              {formatPula(allocationTotal)}
            </span>
            {remaining > 0.001 ? (
              <>
                {' '}
                · unallocated{' '}
                <span className="tabular-nums text-ink-200">{formatPula(remaining)}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {validationError ? (
          <p className="text-sm text-amber-300">{validationError}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={() => setTarget(null)}
            className={adminBtnSecondary}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || Boolean(validationError) || creditAmount <= 0.001}
            className={adminBtnPrimary}
          >
            {saving ? 'Saving…' : 'Adjust balance'}
          </button>
        </div>
      </form>
    </div>
  ) : null

  return {
    saving,
    menuItemsFor,
    dialogs,
    openAdjust,
  }
}
