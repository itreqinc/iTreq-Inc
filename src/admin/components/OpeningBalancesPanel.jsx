import { useCallback, useEffect, useState } from 'react'
import {
  clientOpeningBalanceAmount,
  clientOpeningBalanceDate,
} from '../../lib/clientRegistration'
import { clientOpeningRemaining } from '../../lib/payments'
import { opsApi } from '../../lib/opsApi'
import { ActionsMenu } from '../ActionsMenu'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminTableClass,
  adminColSecondary,
  formatPula,
} from '../ui'
import { useOpeningBalanceActions } from './OpeningBalanceActions'

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
  const { showError } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

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

  const { menuItemsFor, dialogs } = useOpeningBalanceActions({ onDone: load })

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Clients with remaining brought-forward balance. The original amount stays on the client
        record; remaining is calculated from payments. Positive remaining is still owed; negative is
        credit you can apply to invoices.
      </p>

      <table className={adminTableClass}>
        <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
          <tr>
            <th className="px-4 py-3">Client</th>
            <th className={`px-4 py-3 ${adminColSecondary}`}>As of</th>
            <th className="px-4 py-3 text-right">Original</th>
            <th className="px-4 py-3 text-right">Remaining</th>
            <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Unapplied</th>
            <th className="px-4 py-3 w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {loading ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-ink-400">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-ink-400">
                No unpaid brought-forward balances.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const original = clientOpeningBalanceAmount(row)
              const remaining = clientOpeningRemaining(row)
              const asOf = clientOpeningBalanceDate(row)
              const credit = Math.round((Number(row.account_credit) || 0) * 100) / 100
              return (
                <tr key={row.id} className="bg-ink-900/20">
                  <td className="px-4 py-3 text-sm font-medium text-white">{row.name}</td>
                  <td className={`px-4 py-3 text-sm text-ink-400 ${adminColSecondary}`}>
                    {asOf || '—'}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${balanceTone(original)}`}
                  >
                    {formatPula(original)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${balanceTone(remaining)}`}
                  >
                    {formatPula(remaining)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm tabular-nums text-ink-400 ${adminColSecondary}`}
                  >
                    {credit > 0.001 ? formatPula(credit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ActionsMenu
                      label={`Actions for ${row.name}`}
                      items={menuItemsFor(row, {
                        includeEditWhenZero: false,
                        compactLabels: true,
                      })}
                    />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {dialogs}
    </div>
  )
}
