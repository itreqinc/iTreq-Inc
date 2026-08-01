import { useCallback, useEffect, useState } from 'react'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { clientOpeningBalanceAmount, clientOpeningBalanceDate } from '../../lib/clientRegistration'
import { opsApi } from '../../lib/opsApi'
import { invoiceBalanceDue, localTodayIso, PAYMENT_METHODS } from '../../lib/payments'
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
 * Clients with a non-zero brought-forward balance: pay down positive B/F,
 * or apply negative B/F credit to an open invoice.
 */
export function OpeningBalancesPanel({ ownClientId }) {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [payTarget, setPayTarget] = useState(null)
  const [creditTarget, setCreditTarget] = useState(null)
  const [openInvoices, setOpenInvoices] = useState([])
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: '',
    method: 'cash',
    reference: '',
    notes: '',
  })
  const [creditForm, setCreditForm] = useState({
    invoice_id: '',
    amount: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await opsApi.listOpeningBalanceClients({ activeOnly: true })
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setRows(
      (data || []).filter((c) => String(c.id) !== String(ownClientId || '')),
    )
  }, [ownClientId, showError])

  useEffect(() => {
    load()
  }, [load])

  function openPay(client) {
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

  async function openCredit(client) {
    setCreditTarget(client)
    setCreditForm({ invoice_id: '', amount: String(Math.abs(clientOpeningBalanceAmount(client))) })
    setOpenInvoices([])
    const { data, error } = await opsApi.listOpenInvoicesForClient(client.id)
    if (error) {
      showError(error.message)
      return
    }
    setOpenInvoices(data || [])
  }

  async function submitPay(e) {
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
      title: 'Apply payment to brought forward?',
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
    showSuccess('Payment applied to brought-forward balance.')
    setPayTarget(null)
    await load()
  }

  async function submitCredit(e) {
    e.preventDefault()
    if (!creditTarget) return
    if (!creditForm.invoice_id) {
      showError('Choose an invoice to apply the credit to.')
      return
    }
    const available = Math.abs(clientOpeningBalanceAmount(creditTarget))
    const inv = openInvoices.find((i) => i.id === creditForm.invoice_id)
    const due = inv ? invoiceBalanceDue(inv) : available
    let amount = Math.round((Number(creditForm.amount) || 0) * 100) / 100
    if (amount <= 0) amount = Math.min(available, due)
    amount = Math.min(amount, available, due)
    if (amount <= 0) {
      showError('Nothing to apply — check the credit and invoice balance due.')
      return
    }

    const ok = await confirm({
      title: 'Apply brought-forward credit?',
      message: `Apply ${formatPula(amount)} from ${creditTarget.name}'s brought-forward credit to invoice ${inv?.number || ''}.`,
      confirmLabel: 'Apply credit',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.applyOpeningCreditToInvoice(
      creditTarget.id,
      creditForm.invoice_id,
      amount,
    )
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Applied ${formatPula(data?.applied || amount)} to the invoice.`)
    setCreditTarget(null)
    await load()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Clients with a remaining brought-forward balance. Positive amounts are still owed; negative
        amounts are credit you can apply to an invoice.
      </p>

      <table className={adminTableClass}>
        <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            <th className="px-4 py-3">Client</th>
            <th className={`px-4 py-3 ${adminColSecondary}`}>As of</th>
            <th className="px-4 py-3 text-right">Brought forward</th>
            <th className={`px-4 py-3 ${adminColSecondary}`} />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {loading ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-ink-400">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-ink-400">
                No unpaid brought-forward balances.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const opening = clientOpeningBalanceAmount(row)
              const asOf = clientOpeningBalanceDate(row)
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
                  <td className={`px-4 py-3 text-right ${adminColSecondary}`}>
                    {opening > 0 ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => openPay(row)}
                        className={adminBtnSecondary}
                      >
                        Record payment
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => openCredit(row)}
                        className={adminBtnSecondary}
                      >
                        Apply to invoice
                      </button>
                    )}
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
            onSubmit={submitPay}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Pay brought forward — {payTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Outstanding: {formatPula(clientOpeningBalanceAmount(payTarget))}
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

      {creditTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={submitCredit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
          >
            <h2 className="font-display text-lg font-semibold text-white">
              Apply credit — {creditTarget.name}
            </h2>
            <p className="text-sm text-ink-400">
              Brought-forward credit: {formatPula(Math.abs(clientOpeningBalanceAmount(creditTarget)))}
            </p>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Invoice *
              </span>
              <select
                required
                value={creditForm.invoice_id}
                onChange={(e) => {
                  const invoice_id = e.target.value
                  const inv = openInvoices.find((i) => i.id === invoice_id)
                  const due = inv ? invoiceBalanceDue(inv) : 0
                  const available = Math.abs(clientOpeningBalanceAmount(creditTarget))
                  setCreditForm({
                    invoice_id,
                    amount: String(Math.min(available, due) || ''),
                  })
                }}
                className={adminFieldClass}
              >
                <option value="">Select invoice…</option>
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number || 'Invoice'} · due {formatPula(invoiceBalanceDue(inv))}
                  </option>
                ))}
              </select>
            </label>
            {!openInvoices.length ? (
              <p className="text-sm text-ink-400">No open invoices for this client.</p>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Amount
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={creditForm.amount}
                onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))}
                className={adminFieldClass}
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setCreditTarget(null)}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !openInvoices.length}
                className={adminBtnPrimary}
              >
                {saving ? 'Applying…' : 'Apply to invoice'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
