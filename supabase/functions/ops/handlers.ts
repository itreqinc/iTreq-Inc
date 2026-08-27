import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { calcDocTotals, normalizeLines } from '../_shared/billing.ts'
import {
  type UserRow,
  OpsError,
  isAdmin,
  isStaffLike,
  assertNotOwnClient,
  enforcePortalClient,
  portalClientId,
  mapDbError,
} from '../_shared/session.ts'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type HandlerContext = { sb: SupabaseClient; user: UserRow }
export type Handler = (ctx: HandlerContext, args: unknown[]) => Promise<unknown>
export const handlers: Record<string, Handler> = {}

const BALANCE_INVOICE_STATUSES = ['issued', 'partial', 'paid'] as const

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT / bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export const PROOF_BUCKET = 'client-proofs'
const PROOF_MAX_BYTES = 10 * 1024 * 1024
const PROOF_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString()
}

function localTodayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function invoiceAffectsClientBalance(status: string) {
  return BALANCE_INVOICE_STATUSES.includes(status as typeof BALANCE_INVOICE_STATUSES[number])
}

function invoiceBalanceDue(invoice: Record<string, unknown>) {
  const total = Number(invoice.total) || 0
  const paid = Number(invoice.amount_paid) || 0
  return Math.round((total - paid) * 100) / 100
}

/** Client AR credit — exclude money applied to positive opening B/F. */
function paymentStatementCredit(payment: Record<string, unknown>) {
  const amount = Number(payment?.amount) || 0
  const delta = Number(payment?.opening_balance_delta) || 0
  const openingApplied = Math.max(0, -delta)
  return Math.round((amount - openingApplied) * 100) / 100
}

/** Statement-line credit — full payment, including money applied to B/F. */
function paymentTimelineCredit(payment: Record<string, unknown>) {
  if (payment?.is_adjustment) return 0
  return Math.round((Number(payment?.amount) || 0) * 100) / 100
}

function openingBalanceAppliedFromPayments(payments: Record<string, unknown>[] = []) {
  let paidTowardOpening = 0
  let creditAppliedToInvoices = 0
  for (const pay of payments || []) {
    const delta = Number(pay?.opening_balance_delta) || 0
    if (delta < 0) paidTowardOpening += -delta
    else if (delta > 0) creditAppliedToInvoices += delta
  }
  return {
    paidTowardOpening: Math.round(paidTowardOpening * 100) / 100,
    creditAppliedToInvoices: Math.round(creditAppliedToInvoices * 100) / 100,
  }
}

function openingBalanceRemaining(
  original: number,
  paymentsOrApplied:
    | Record<string, unknown>[]
    | { paidTowardOpening?: number; creditAppliedToInvoices?: number } = [],
) {
  const orig = Math.round((Number(original) || 0) * 100) / 100
  let paidTowardOpening = 0
  let creditAppliedToInvoices = 0
  if (
    paymentsOrApplied &&
    !Array.isArray(paymentsOrApplied) &&
    (paymentsOrApplied.paidTowardOpening != null ||
      paymentsOrApplied.creditAppliedToInvoices != null)
  ) {
    paidTowardOpening = Number(paymentsOrApplied.paidTowardOpening) || 0
    creditAppliedToInvoices = Number(paymentsOrApplied.creditAppliedToInvoices) || 0
  } else {
    const applied = openingBalanceAppliedFromPayments(
      paymentsOrApplied as Record<string, unknown>[],
    )
    paidTowardOpening = applied.paidTowardOpening
    creditAppliedToInvoices = applied.creditAppliedToInvoices
  }
  return Math.round((orig - paidTowardOpening + creditAppliedToInvoices) * 100) / 100
}

function openingBalanceRemainingMap(
  clients: Record<string, unknown>[],
  payments: Record<string, unknown>[] = [],
) {
  const deltas: Record<string, number> = {}
  for (const pay of payments || []) {
    const id = String(pay?.client_id || '')
    if (!id) continue
    deltas[id] = (deltas[id] || 0) + (Number(pay.opening_balance_delta) || 0)
  }
  const map: Record<string, number> = {}
  for (const c of clients || []) {
    const id = String(c.id)
    const original = clientOpeningBalanceAmount(c)
    map[id] = Math.round((original + (deltas[id] || 0)) * 100) / 100
  }
  return map
}

function openingBalanceCarryIn(
  client: Record<string, unknown> | null | undefined,
  payments: Record<string, unknown>[] = [],
) {
  const originalAmount = clientOpeningBalanceAmount(client)
  const { paidTowardOpening, creditAppliedToInvoices } =
    openingBalanceAppliedFromPayments(payments)
  const remaining = openingBalanceRemaining(originalAmount, {
    paidTowardOpening,
    creditAppliedToInvoices,
  })

  let asOfDate = clientOpeningBalanceDate(client)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    let earliest = ''
    for (const pay of payments || []) {
      const delta = Number(pay?.opening_balance_delta) || 0
      if (delta === 0 && !(pay?.is_adjustment && Number(pay?.amount))) continue
      const src = String(pay.source_date || pay.payment_date || '').slice(0, 10)
      if (src && (!earliest || src < earliest)) earliest = src
    }
    asOfDate = earliest
  }

  const hasHistory =
    Math.abs(originalAmount) > 0.001 ||
    paidTowardOpening > 0.001 ||
    creditAppliedToInvoices > 0.001
  const isSettled = hasHistory && Math.abs(remaining) <= 0.001

  return {
    originalAmount,
    asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : '',
    remaining,
    hasHistory,
    isSettled,
    paidTowardOpening,
    creditAppliedToInvoices,
  }
}

function addMonthsIso(isoDate: string, months = 1) {
  const [y, m, d] = String(isoDate || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!y || !m || !d) return ''
  const shifted = m - 1 + months
  const year = y + Math.floor(shifted / 12)
  const month = ((shifted % 12) + 12) % 12 + 1
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const INVOICE_DUE_DAYS = 5

function addDaysIso(isoDate: string, days: number) {
  const base = String(isoDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return ''
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return localTodayIso(dt)
}

function dueDateFromIssueDate(issueDate: string, days = INVOICE_DUE_DAYS) {
  const issue = String(issueDate || '').slice(0, 10)
  if (!issue) return ''
  return addDaysIso(issue, days)
}

function resolveInvoiceDates(
  payload: Record<string, unknown>,
  existing?: Record<string, unknown>,
) {
  if (existing?.billing_period || payload.billing_period) {
    const issueRaw = payload.issue_date ?? existing?.issue_date
    const dueRaw = payload.due_date ?? existing?.due_date
    return {
      issue_date: issueRaw ? String(issueRaw).slice(0, 10) : localTodayIso(),
      due_date: dueRaw ? String(dueRaw).slice(0, 10) : null,
    }
  }
  const issue = String(
    payload.issue_date || existing?.issue_date || localTodayIso(),
  ).slice(0, 10)
  return {
    issue_date: issue,
    due_date: dueDateFromIssueDate(issue),
  }
}

function invoiceEffectiveDueDate(invoice: Record<string, unknown>) {
  const due = invoice?.due_date ? String(invoice.due_date).slice(0, 10) : ''
  if (due) return due
  const issued = invoice?.issue_date ? String(invoice.issue_date).slice(0, 10) : ''
  return issued ? dueDateFromIssueDate(issued) : ''
}

function summarizeReceivables(invoices: Record<string, unknown>[], today = localTodayIso()) {
  const summary = {
    overdue: 0,
    overdueCount: 0,
    due: 0,
    dueCount: 0,
    total: 0,
    nextDueDate: '',
  }
  for (const inv of invoices || []) {
    if (!invoiceAffectsClientBalance(String(inv?.status || ''))) continue
    const balance = invoiceBalanceDue(inv)
    if (balance <= 0.001) continue
    const dueDate = invoiceEffectiveDueDate(inv)
    if (dueDate && dueDate < today) {
      summary.overdue += balance
      summary.overdueCount += 1
    } else {
      summary.due += balance
      summary.dueCount += 1
      if (dueDate && (!summary.nextDueDate || dueDate < summary.nextDueDate)) {
        summary.nextDueDate = dueDate
      }
    }
  }
  summary.overdue = Math.round(summary.overdue * 100) / 100
  summary.due = Math.round(summary.due * 100) / 100
  summary.total = Math.round((summary.overdue + summary.due) * 100) / 100
  return summary
}

function disputeUnreadCount(
  dispute: Record<string, unknown>,
  role: 'staff' | 'client',
) {
  if (!dispute) return 0
  const lastRead =
    role === 'staff' ? dispute.staff_last_read_at : dispute.client_last_read_at
  const messages = (dispute.messages as Record<string, unknown>[]) || []
  return messages.filter((msg) => {
    if (msg.author_role === role) return false
    if (!lastRead) return true
    return String(msg.created_at) > String(lastRead)
  }).length
}

function sortExpenseCategories(rows: Record<string, unknown>[]) {
  return [...(rows || [])].sort((a, b) => {
    const aOther = String(a?.name || '').trim().toLowerCase() === 'other'
    const bOther = String(b?.name || '').trim().toLowerCase() === 'other'
    if (aOther !== bOther) return aOther ? 1 : -1
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
      sensitivity: 'base',
    })
  })
}

function normEmail(v: unknown) {
  const s = String(v ?? '').trim()
  return s ? s.toLowerCase() : ''
}

function normIdNumber(v: unknown) {
  return String(v ?? '')
    .replace(/\s+/g, '')
    .trim()
}

function buildClientDisplayName(form: Record<string, unknown>) {
  const parts = [form.first_name, form.middle_name, form.surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
  if (parts.length) return parts.join(' ')
  return String(form.name || '').trim()
}

function formToPersonRow(form: Record<string, unknown>) {
  const displayName = buildClientDisplayName(form)
  const cellphone = form.cellphone ? String(form.cellphone).trim() : null
  const physical = form.physical_address ? String(form.physical_address).trim() : null
  const gender = form.gender === 'M' || form.gender === 'F' ? form.gender : null
  return {
    name: displayName,
    phone: cellphone,
    email: normEmail(form.email) || null,
    address: physical,
    notes: form.notes ? String(form.notes).trim() : null,
    gender,
    first_name: form.first_name ? String(form.first_name).trim() : null,
    middle_name: form.middle_name ? String(form.middle_name).trim() : null,
    surname: form.surname ? String(form.surname).trim() : null,
    id_number: normIdNumber(form.id_number) || null,
    country: form.country ? String(form.country).trim() : null,
    cellphone,
    landline: form.landline ? String(form.landline).trim() : null,
    postal_address: form.postal_address ? String(form.postal_address).trim() : null,
    physical_address: physical,
  }
}

function formToClientRow(form: Record<string, unknown>) {
  const opening = Math.round((Number(form.opening_balance) || 0) * 100) / 100
  const dateRaw = String(form.opening_balance_date || '').trim().slice(0, 10)
  return {
    ...formToPersonRow(form),
    opening_balance: opening,
    opening_balance_date: opening !== 0 && dateRaw ? dateRaw : null,
  }
}

function formToLeadRow(form: Record<string, unknown>) {
  const base = formToPersonRow(form)
  return {
    ...base,
    phone: base.phone || base.cellphone,
  }
}

function clientOpeningBalanceAmount(client: Record<string, unknown> | null | undefined) {
  return Math.round((Number(client?.opening_balance) || 0) * 100) / 100
}

function clientOpeningBalanceDate(client: Record<string, unknown> | null | undefined) {
  const d = String(client?.opening_balance_date || '').trim().slice(0, 10)
  return d || ''
}

function applyOpeningBalanceFields(
  user: UserRow,
  row: Record<string, unknown>,
  clientId?: string | null,
) {
  if (!isStaffLike(user)) {
    delete row.opening_balance
    delete row.opening_balance_date
    return
  }
  if (clientId && String(portalClientId(user) || '') === String(clientId)) {
    delete row.opening_balance
    delete row.opening_balance_date
    return
  }
  const amount = clientOpeningBalanceAmount(row)
  const date = clientOpeningBalanceDate(row)
  if (amount !== 0 && !date) {
    throw new OpsError('Choose an opening balance date when the amount is not zero.')
  }
}

function leadToBillingClient(lead: Record<string, unknown>) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.cellphone || lead.phone,
    cellphone: lead.cellphone || lead.phone,
    landline: lead.landline,
    postal_address: lead.postal_address,
    physical_address: lead.physical_address || lead.address,
    address: lead.physical_address || lead.address,
    id_number: lead.id_number,
    country: lead.country,
    first_name: lead.first_name,
    middle_name: lead.middle_name,
    surname: lead.surname,
    gender: lead.gender,
    notes: lead.notes,
  }
}

async function getLeadInternal(sb: SupabaseClient, id: string) {
  const { data, error } = await sb.from('contact_submissions').select('*').eq('id', id).single()
  if (error) throw mapDbError(error)
  return data as Record<string, unknown>
}

async function leadHasQuotations(sb: SupabaseClient, leadId: string) {
  const { count, error } = await sb
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .eq('contact_submission_id', leadId)
  if (error) throw mapDbError(error)
  return (count || 0) > 0
}

function assertAdminUser(user: UserRow) {
  if (!isAdmin(user)) throw new OpsError('Admin access required for this action.', 403)
}

function relName(row: Record<string, unknown>, key: string) {
  const rel = row[key]
  if (Array.isArray(rel)) return rel[0] as Record<string, unknown> | undefined
  return rel as Record<string, unknown> | undefined
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    throw new OpsError(
      'Email is not configured yet (missing RESEND_API_KEY on the server). Use Print / Save PDF or configure Resend in Supabase.',
      503,
    )
  }
  const from =
    Deno.env.get('OPS_EMAIL_FROM')?.trim() ||
    Deno.env.get('RESEND_FROM')?.trim() ||
    'iTreq Inc <no-reply@itreqinc.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text: text || subject,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('Resend error:', errText)
    throw new OpsError('Could not send email. Check Resend configuration.', 500)
  }
}

function simpleEmailHtml(title: string, body: string) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#333"><h2>${esc(title)}</h2><pre style="white-space:pre-wrap;font-family:inherit">${esc(body)}</pre></body></html>`
}

// ---------------------------------------------------------------------------
// Internal data access
// ---------------------------------------------------------------------------

async function getSettingsInternal(sb: SupabaseClient) {
  const { data, error } = await sb.from('company_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw mapDbError(error)
  if (!data) {
    throw new OpsError(
      'Company settings row is missing. Apply migrations or insert company_settings id=1.',
      500,
    )
  }
  return data as Record<string, unknown>
}

async function listClientsInternal(sb: SupabaseClient, { activeOnly = false } = {}) {
  let q = sb.from('clients').select('*').order('name', { ascending: true })
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  return (data || []) as Record<string, unknown>[]
}

async function clientHasFinancialRecords(sb: SupabaseClient, clientId: string) {
  const tables = ['invoices', 'quotations', 'payments']
  for (const table of tables) {
    const { count, error } = await sb
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
    if (error) throw mapDbError(error)
    if ((count || 0) > 0) return true
  }
  return false
}

async function enrichClientsFinancialFlags(
  sb: SupabaseClient,
  clients: Record<string, unknown>[],
) {
  if (!clients.length) return clients
  const withRecords = new Set<string>()
  for (const table of ['invoices', 'quotations', 'payments']) {
    const { data, error } = await sb.from(table).select('client_id')
    if (error) throw mapDbError(error)
    for (const row of data || []) {
      withRecords.add(String((row as { client_id: string }).client_id))
    }
  }
  return clients.map((c) => ({
    ...c,
    has_financial_records: withRecords.has(String(c.id)),
  }))
}

async function getClientInternal(sb: SupabaseClient, id: string) {
  const { data, error } = await sb.from('clients').select('*').eq('id', id).single()
  if (error) throw mapDbError(error)
  return data as Record<string, unknown>
}

async function listProductsInternal(
  sb: SupabaseClient,
  { activeOnly = false } = {},
) {
  let q = sb.from('products').select('*').order('sku', { ascending: true })
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  return (data || []) as Record<string, unknown>[]
}

async function getQuotationInternal(sb: SupabaseClient, id: string) {
  const { data: quotation, error } = await sb
    .from('quotations')
    .select('*, clients(name), contact_submissions(name)')
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  const { data: lines, error: lineErr } = await sb
    .from('quotation_lines')
    .select('*')
    .eq('quotation_id', id)
    .order('sort_order', { ascending: true })
  if (lineErr) throw mapDbError(lineErr)
  return { ...(quotation as Record<string, unknown>), lines: lines || [] }
}

async function getInvoiceInternal(sb: SupabaseClient, id: string) {
  const { data: invoice, error } = await sb
    .from('invoices')
    .select('*, clients(name)')
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  const { data: lines, error: lineErr } = await sb
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true })
  if (lineErr) throw mapDbError(lineErr)
  return { ...(invoice as Record<string, unknown>), lines: lines || [] }
}

async function getPaymentInternal(sb: SupabaseClient, id: string) {
  const { data: payment, error } = await sb
    .from('payments')
    .select('*, clients(name)')
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  const { data: allocations, error: allocErr } = await sb
    .from('payment_allocations')
    .select('*, invoices(id, number, total, amount_paid, status)')
    .eq('payment_id', id)
  if (allocErr) throw mapDbError(allocErr)
  return { ...(payment as Record<string, unknown>), allocations: allocations || [] }
}

async function getPurchaseOrderInternal(sb: SupabaseClient, id: string) {
  const { data, error } = await sb
    .from('purchase_orders')
    .select(
      `*,
      purchase_order_lines(
        id, product_id, quantity_ordered, quantity_received, unit_cost,
        products(id, sku, name)
      ),
      purchase_receipts(
        id, received_date, notes, created_at,
        purchase_receipt_lines(
          id, purchase_order_line_id, product_id, quantity,
          products(id, sku, name)
        )
      )`,
    )
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  const po = data as Record<string, unknown>
  if (Array.isArray(po.purchase_receipts)) {
    po.purchase_receipts.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(b.received_date).localeCompare(String(a.received_date)),
    )
  }
  return po
}

async function listTrackableItemsInternal(
  sb: SupabaseClient,
  { activeOnly = false, withComponents = false } = {},
) {
  const select = withComponents
    ? '*, trackable_item_components(id, product_id, quantity, sort_order, products(id, sku, name, unit_price, tracks_stock, product_kind, active))'
    : '*'
  let q = sb
    .from('trackable_items')
    .select(select)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw mapDbError(error)

  if (withComponents) {
    return (data || []).map((item: Record<string, unknown>) => {
      const components = [...((item.trackable_item_components as Record<string, unknown>[]) || [])].sort(
        (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
      )
      const { trackable_item_components: _drop, ...rest } = item
      return { ...rest, components }
    })
  }
  return data || []
}

async function linesFromCatalogSelectionsInternal(
  sb: SupabaseClient,
  selections: Record<string, unknown>[],
) {
  const picks = (selections || [])
    .map((s) => ({
      trackable_item_id: s.trackable_item_id,
      quantity: Number(s.quantity) || 0,
    }))
    .filter((s) => s.trackable_item_id && s.quantity > 0)

  if (!picks.length) {
    throw new OpsError('Select at least one item to track and set a quantity.')
  }

  const catalog = await listTrackableItemsInternal(sb, { activeOnly: true, withComponents: true })
  const byId = new Map(
    (catalog as Record<string, unknown>[]).map((item) => [item.id, item]),
  )
  const lines: Record<string, unknown>[] = []
  let sort = 1

  for (const pick of picks) {
    const item = byId.get(pick.trackable_item_id)
    if (!item) {
      throw new OpsError('One of the selected items is no longer available.')
    }
    const components = (item.components as Record<string, unknown>[]) || []
    if (!components.length) {
      throw new OpsError(`"${item.name}" is not configured yet. Please contact iTreq Inc.`)
    }
    for (const comp of components) {
      const product = Array.isArray(comp.products)
        ? (comp.products[0] as Record<string, unknown>)
        : (comp.products as Record<string, unknown>)
      if (!product || product.active === false) {
        throw new OpsError(
          `"${item.name}" has an inactive product mapping. Please contact iTreq Inc.`,
        )
      }
      const qty = Math.round(Number(comp.quantity) * pick.quantity * 100) / 100
      const productKind = String(product.product_kind || '')
      const kind =
        productKind ||
        (product.tracks_stock ? 'hardware' : 'monthly_fee')
      let description: string
      if (kind === 'monthly_fee') {
        description = `${item.name} — ${product.name}`
      } else if (kind === 'usage') {
        description = String(product.name || 'Usage charge')
      } else {
        description = `${item.name} - Tracker Installation`
      }
      lines.push({
        product_id: product.id,
        trackable_item_id: item.id,
        description,
        quantity: qty,
        unit_price: Number(product.unit_price) || 0,
        sort_order: sort++,
      })
    }
  }
  return lines
}

async function saveQuotationInternal(
  sb: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const {
    id,
    client_id,
    contact_submission_id,
    issue_date,
    notes,
    status,
    lines,
    discount_amount,
    source,
  } = payload
  const settings = await getSettingsInternal(sb)
  const taxRate = Number(settings.default_tax_rate) || 0
  const normalized = normalizeLines(lines as unknown[])
  const hasClient = Boolean(client_id)
  const hasLead = Boolean(contact_submission_id)
  if (!hasClient && !hasLead) throw new OpsError('Please select a client or lead.')
  if (hasClient && hasLead) throw new OpsError('Select either a client or a lead, not both.')
  if (!normalized.length) throw new OpsError('Add at least one line item.')
  const totals = calcDocTotals(normalized, taxRate, Number(discount_amount) || 0)
  const docSource = source === 'portal' ? 'portal' : 'staff'

  let quoteId = id ? String(id) : null
  let number: string | null = null

  if (quoteId) {
    const existing = await getQuotationInternal(sb, quoteId)
    if (['converted', 'cancelled'].includes(String(existing.status))) {
      throw new OpsError('This quotation can no longer be edited.')
    }
    number = String(existing.number || '')
    const { error } = await sb
      .from('quotations')
      .update({
        client_id: hasClient ? String(client_id) : null,
        contact_submission_id: hasLead ? String(contact_submission_id) : null,
        issue_date: issue_date || existing.issue_date,
        notes: notes ? String(notes).trim() : null,
        status: status || existing.status,
        ...totals,
        updated_at: nowIso(),
      })
      .eq('id', quoteId)
    if (error) throw mapDbError(error)
    await sb.from('quotation_lines').delete().eq('quotation_id', quoteId)
  } else {
    const { data: allocated, error: allocErr } = await sb.rpc('allocate_document_number', {
      doc_type: 'quote',
    })
    if (allocErr) throw mapDbError(allocErr)
    number = String(allocated)
    const { data, error } = await sb
      .from('quotations')
      .insert({
        client_id: hasClient ? String(client_id) : null,
        contact_submission_id: hasLead ? String(contact_submission_id) : null,
        number,
        issue_date: issue_date || localTodayIso(),
        notes: notes ? String(notes).trim() : null,
        status: status || 'draft',
        source: docSource,
        ...totals,
      })
      .select()
      .single()
    if (error) throw mapDbError(error)
    quoteId = String((data as Record<string, unknown>).id)
  }

  const lineRows = normalized.map((line) => ({
    quotation_id: quoteId,
    product_id: line.product_id,
    trackable_item_id: line.trackable_item_id || null,
    description: line.description || 'Item',
    quantity: line.quantity,
    unit_price: line.unit_price,
    line_total: line.line_total,
    sort_order: line.sort_order,
  }))
  const { error: linesErr } = await sb.from('quotation_lines').insert(lineRows)
  if (linesErr) throw mapDbError(linesErr)

  return getQuotationInternal(sb, quoteId!)
}

async function saveInvoiceInternal(
  sb: SupabaseClient,
  payload: Record<string, unknown>,
) {
  const {
    id,
    client_id,
    quotation_id,
    issue_date,
    due_date,
    notes,
    status,
    lines,
    discount_amount,
  } = payload
  const settings = await getSettingsInternal(sb)
  const taxRate = Number(settings.default_tax_rate) || 0
  const normalized = normalizeLines(lines as unknown[])
  if (!client_id) throw new OpsError('Please select a client.')
  if (!normalized.length) throw new OpsError('Add at least one line item.')
  const totals = calcDocTotals(normalized, taxRate, Number(discount_amount) || 0)

  let invoiceId = id ? String(id) : null
  const existingRow = invoiceId ? await getInvoiceInternal(sb, invoiceId) : null
  const dates = resolveInvoiceDates(payload, existingRow || undefined)

  if (invoiceId) {
    const existing = existingRow!
    if (existing.status !== 'draft') {
      throw new OpsError('Only draft invoices can be edited.')
    }
    const { error } = await sb
      .from('invoices')
      .update({
        client_id,
        quotation_id: quotation_id || existing.quotation_id,
        issue_date: dates.issue_date,
        due_date: dates.due_date,
        notes: notes ? String(notes).trim() : null,
        status: 'draft',
        ...totals,
        updated_at: nowIso(),
      })
      .eq('id', invoiceId)
    if (error) throw mapDbError(error)
    await sb.from('invoice_lines').delete().eq('invoice_id', invoiceId)
  } else {
    const { data, error } = await sb
      .from('invoices')
      .insert({
        client_id,
        quotation_id: quotation_id || null,
        issue_date: dates.issue_date,
        due_date: dates.due_date,
        notes: notes ? String(notes).trim() : null,
        status: status || 'draft',
        ...totals,
      })
      .select()
      .single()
    if (error) throw mapDbError(error)
    invoiceId = String((data as Record<string, unknown>).id)
  }

  const lineRows = normalized.map((line) => ({
    invoice_id: invoiceId,
    product_id: line.product_id,
    trackable_item_id: line.trackable_item_id || null,
    description: line.description || 'Item',
    quantity: line.quantity,
    unit_price: line.unit_price,
    line_total: line.line_total,
    sort_order: line.sort_order,
  }))
  const { error: linesErr } = await sb.from('invoice_lines').insert(lineRows)
  if (linesErr) throw mapDbError(linesErr)

  return getInvoiceInternal(sb, invoiceId!)
}

async function getBillingDocumentBundleInternal(
  sb: SupabaseClient,
  documentType: string,
  id: string,
) {
  const type = documentType === 'invoice' ? 'invoice' : 'quote'
  const settings = await getSettingsInternal(sb)
  const doc =
    type === 'quote'
      ? await getQuotationInternal(sb, id)
      : await getInvoiceInternal(sb, id)
  let client: Record<string, unknown>
  if (doc.client_id) {
    client = await getClientInternal(sb, String(doc.client_id))
  } else if (type === 'quote' && doc.contact_submission_id) {
    const lead = await getLeadInternal(sb, String(doc.contact_submission_id))
    client = leadToBillingClient(lead)
  } else {
    throw new OpsError('Document has no recipient.')
  }

  let paidDate: string | null = null
  if (type === 'invoice' && doc.status === 'paid') {
    const { data: allocs, error: allocErr } = await sb
      .from('payment_allocations')
      .select('amount, payments(payment_date, source_date)')
      .eq('invoice_id', id)
    if (allocErr) throw mapDbError(allocErr)
    for (const row of allocs || []) {
      const pay = relName(row as Record<string, unknown>, 'payments')
      // Stamp shows original economic date (e.g. B/F as-of); timeline uses payment_date.
      const d = pay?.source_date
        ? String(pay.source_date)
        : pay?.payment_date
          ? String(pay.payment_date)
          : ''
      if (d && (!paidDate || d > paidDate)) paidDate = d
    }
  }

  const products = await listProductsInternal(sb)
  const productsById = Object.fromEntries(products.map((p) => [p.id, p]))

  return {
    type,
    doc: { ...doc, paid_date: paidDate },
    client,
    settings,
    productsById,
  }
}

async function getPaymentDocumentBundleInternal(sb: SupabaseClient, id: string) {
  const payment = await getPaymentInternal(sb, id)
  const settings = await getSettingsInternal(sb)
  const client = await getClientInternal(sb, String(payment.client_id))
  return { payment, client, settings }
}

async function getIncomeReportInternal(
  sb: SupabaseClient,
  { from, to }: { from?: string; to?: string } = {},
) {
  let q = sb
    .from('payments')
    .select('id, amount, method, payment_date, reference, notes, clients(name)')
    .eq('is_adjustment', false)
    .order('payment_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (from) q = q.gte('payment_date', from)
  if (to) q = q.lte('payment_date', to)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  const rows = (data || []) as Record<string, unknown>[]
  const byMethod: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const amt = Number(row.amount) || 0
    total += amt
    const key = String(row.method || 'other')
    byMethod[key] = (byMethod[key] || 0) + amt
  }

  const seen = new Set<string>()
  const methodTotals = PAYMENT_METHODS.map((m) => {
    seen.add(m.value)
    return {
      method: m.value,
      label: m.label,
      amount: Math.round((byMethod[m.value] || 0) * 100) / 100,
    }
  })
  for (const [method, amount] of Object.entries(byMethod)) {
    if (seen.has(method)) continue
    methodTotals.push({
      method,
      label: method,
      amount: Math.round(amount * 100) / 100,
    })
  }

  return {
    from: from || null,
    to: to || null,
    total: Math.round(total * 100) / 100,
    paymentCount: rows.length,
    methodTotals,
    byMethod: methodTotals.filter((row) => row.amount > 0),
    payments: rows.map((row) => {
      const client = relName(row, 'clients')
      return {
        id: row.id,
        payment_date: row.payment_date,
        amount: Number(row.amount) || 0,
        method: row.method || 'other',
        reference: row.reference || null,
        notes: row.notes || null,
        client_name: client?.name || '—',
      }
    }),
  }
}

async function getExpensesReportInternal(
  sb: SupabaseClient,
  { from, to }: { from?: string; to?: string } = {},
) {
  let q = sb
    .from('expenses')
    .select(
      'id, expense_date, amount, vendor, method, reference, notes, category_id, expense_categories(id, name)',
    )
    .order('expense_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (from) q = q.gte('expense_date', from)
  if (to) q = q.lte('expense_date', to)

  const catQ = sb.from('expense_categories').select('*')
  const [expRes, catRes] = await Promise.all([q, catQ])
  if (expRes.error) throw mapDbError(expRes.error)
  if (catRes.error) throw mapDbError(catRes.error)

  const rows = (expRes.data || []) as Record<string, unknown>[]
  const byMethod: Record<string, number> = {}
  const byCategoryId: Record<string, number> = {}
  const byCategoryName: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const amt = Number(row.amount) || 0
    total += amt
    const methodKey = String(row.method || 'other')
    byMethod[methodKey] = (byMethod[methodKey] || 0) + amt
    const cat = relName(row, 'expense_categories')
    const catId = row.category_id || cat?.id
    const catName = cat?.name ? String(cat.name) : 'Uncategorised'
    if (catId) byCategoryId[String(catId)] = (byCategoryId[String(catId)] || 0) + amt
    byCategoryName[catName] = (byCategoryName[catName] || 0) + amt
  }

  const catalog = sortExpenseCategories((catRes.data || []) as Record<string, unknown>[])
  const seenNames = new Set<string>()
  const categoryTotals = catalog.map((c) => {
    seenNames.add(String(c.name))
    const amount =
      Math.round((byCategoryId[String(c.id)] || byCategoryName[String(c.name)] || 0) * 100) / 100
    return {
      category: c.name,
      amount,
      active: Boolean(c.active),
    }
  })
  for (const [name, amount] of Object.entries(byCategoryName)) {
    if (seenNames.has(name)) continue
    categoryTotals.push({
      category: name,
      amount: Math.round(amount * 100) / 100,
      active: true,
    })
  }

  return {
    from: from || null,
    to: to || null,
    total: Math.round(total * 100) / 100,
    expenseCount: rows.length,
    byMethod: Object.entries(byMethod).map(([method, amount]) => ({
      method,
      amount: Math.round(amount * 100) / 100,
    })),
    categoryTotals,
    byCategory: categoryTotals.filter((row) => row.amount > 0),
    expenses: rows.map((row) => {
      const cat = relName(row, 'expense_categories')
      return {
        id: row.id,
        expense_date: row.expense_date,
        amount: Number(row.amount) || 0,
        vendor: row.vendor || null,
        method: row.method || 'other',
        reference: row.reference || null,
        notes: row.notes || null,
        category_name: cat?.name || '—',
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

handlers.get_status = async () => ({
  supabaseConfigured: true,
  phase: 'phase-6-edge',
})

handlers.list_clients = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { activeOnly?: boolean }
  const clients = await listClientsInternal(sb, opts)
  if (opts.activeOnly) return clients
  return enrichClientsFinancialFlags(sb, clients)
}

handlers.list_clients_with_balances = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { activeOnly?: boolean }
  const clients = await enrichClientsFinancialFlags(
    sb,
    await listClientsInternal(sb, opts),
  )
  const [invRes, payRes] = await Promise.all([
    sb.from('invoices').select('client_id, total, status').in('status', [...BALANCE_INVOICE_STATUSES]),
    sb.from('payments').select('client_id, amount, opening_balance_delta'),
  ])
  if (invRes.error) throw mapDbError(invRes.error)
  if (payRes.error) throw mapDbError(payRes.error)

  const charges: Record<string, number> = {}
  for (const inv of invRes.data || []) {
    if (!invoiceAffectsClientBalance(String(inv.status))) continue
    const id = String(inv.client_id)
    charges[id] = (charges[id] || 0) + (Number(inv.total) || 0)
  }
  const credits: Record<string, number> = {}
  for (const pay of payRes.data || []) {
    const id = String(pay.client_id)
    credits[id] = (credits[id] || 0) + paymentStatementCredit(pay as Record<string, unknown>)
  }
  const remainingById = openingBalanceRemainingMap(
    clients as Record<string, unknown>[],
    (payRes.data || []) as Record<string, unknown>[],
  )

  return clients.map((c) => {
    const remaining = remainingById[String(c.id)] || 0
    return {
      ...c,
      opening_balance_remaining: remaining,
      balance: Math.round(
        ((charges[String(c.id)] || 0) - (credits[String(c.id)] || 0) + remaining) * 100,
      ) / 100,
    }
  })
}

handlers.get_client = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getClientInternal(sb, id)
}

handlers.create_client = async ({ user, sb }, args) => {
  const form = (args[0] || {}) as Record<string, unknown>
  const displayName = buildClientDisplayName(form)
  if (!displayName) throw new OpsError('First name or surname is required.')
  const row = formToClientRow(form)
  applyOpeningBalanceFields(user, row)
  const { data, error } = await sb.from('clients').insert(row).select().single()
  if (error) throw mapDbError(error)
  return data
}

handlers.update_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const form = (args[1] || {}) as Record<string, unknown>
  const displayName = buildClientDisplayName(form)
  if (!displayName) throw new OpsError('First name or surname is required.')
  const row = formToClientRow(form)
  applyOpeningBalanceFields(user, row, id)
  const { data, error } = await sb
    .from('clients')
    .update({ ...row, updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.update_client_opening_balance = async ({ user, sb }, args) => {
  if (!isStaffLike(user)) {
    throw new OpsError('Staff access required for this action.', 403)
  }
  const id = String(args[0] || '')
  assertNotOwnClient(user, id)
  const body = (args[1] || {}) as Record<string, unknown>
  if (!id) throw new OpsError('Client id is required.')
  const amount = Math.round((Number(body.opening_balance) || 0) * 100) / 100
  let dateRaw = String(body.opening_balance_date || '').trim().slice(0, 10)

  if (amount === 0) {
    const { data, error } = await sb
      .from('clients')
      .update({
        opening_balance: 0,
        opening_balance_date: null,
        updated_at: nowIso(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw mapDbError(error)
    return data
  }

  // Remaining balance must keep an as-of date — never wipe it while amount remains.
  if (!dateRaw) {
    const { data: existing, error: existingErr } = await sb
      .from('clients')
      .select('opening_balance_date')
      .eq('id', id)
      .single()
    if (existingErr) throw mapDbError(existingErr)
    dateRaw = String(existing?.opening_balance_date || '').trim().slice(0, 10)
  }
  if (!dateRaw) {
    throw new OpsError('Choose an opening balance date when the amount is not zero.')
  }

  const { data, error } = await sb
    .from('clients')
    .update({
      opening_balance: amount,
      opening_balance_date: dateRaw,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_client = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  if (!id) throw new OpsError('Client id is required.')

  if (await clientHasFinancialRecords(sb, id)) {
    throw new OpsError(
      'This client has invoices, quotations, or payments. Deactivate the client instead of deleting.',
    )
  }

  // Drop portal access before delete (client_id becomes null on users FK).
  await sb
    .from('users')
    .update({ is_active: false, updated_at: nowIso() })
    .eq('client_id', id)
    .eq('role', 'client')

  const { error } = await sb.from('clients').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return { ok: true }
}

handlers.set_client_active = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const payload = args[1] as { is_active?: boolean } | boolean | undefined
  const isActive = typeof payload === 'boolean' ? payload : !!payload?.is_active
  if (!id) throw new OpsError('Client id is required.')

  const { data, error } = await sb
    .from('clients')
    .update({ is_active: isActive, updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)

  // Deactivated clients must not remain inviteable / portal-active.
  if (!isActive) {
    await sb
      .from('users')
      .update({ is_active: false, updated_at: nowIso() })
      .eq('client_id', id)
      .eq('role', 'client')
  }

  return data
}

handlers.list_leads = async ({ sb }, args) => {
  const { status } = (args[0] || {}) as { status?: string }
  let query = sb.from('contact_submissions').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_lead = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getLeadInternal(sb, id)
}

handlers.create_lead = async ({ sb }, args) => {
  const form = (args[0] || {}) as Record<string, unknown>
  const displayName = buildClientDisplayName(form)
  if (!displayName) throw new OpsError('First name or surname is required.')
  const { data, error } = await sb
    .from('contact_submissions')
    .insert({ ...formToLeadRow(form), status: 'new' })
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.update_lead = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const form = (args[1] || {}) as Record<string, unknown>
  const displayName = buildClientDisplayName(form)
  if (!displayName) throw new OpsError('First name or surname is required.')
  const { data, error } = await sb
    .from('contact_submissions')
    .update({ ...formToLeadRow(form), updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.dismiss_lead = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const { data, error } = await sb
    .from('contact_submissions')
    .update({ status: 'dismissed', updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.convert_lead_to_client = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const lead = await getLeadInternal(sb, id)
  if (String(lead.status) === 'converted' && lead.converted_client_id) {
    return getClientInternal(sb, String(lead.converted_client_id))
  }

  const row = formToClientRow(lead)
  const { data: client, error } = await sb
    .from('clients')
    .insert({ ...row, contact_submission_id: id })
    .select()
    .single()
  if (error) throw mapDbError(error)

  const { error: leadErr } = await sb
    .from('contact_submissions')
    .update({
      status: 'converted',
      converted_client_id: client.id,
      updated_at: nowIso(),
    })
    .eq('id', id)
  if (leadErr) throw mapDbError(leadErr)

  const { error: quoteErr } = await sb
    .from('quotations')
    .update({
      client_id: client.id,
      contact_submission_id: null,
      updated_at: nowIso(),
    })
    .eq('contact_submission_id', id)
  if (quoteErr) throw mapDbError(quoteErr)

  return client
}

handlers.delete_lead = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  if (!id) throw new OpsError('Lead id is required.')
  if (await leadHasQuotations(sb, id)) {
    throw new OpsError('This lead has quotations. Convert to a client or delete the quotations first.')
  }
  const { error } = await sb.from('contact_submissions').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return { ok: true }
}

handlers.list_products = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { activeOnly?: boolean }
  return listProductsInternal(sb, opts)
}

handlers.update_product = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  const payload = (args[1] || {}) as Record<string, unknown>
  const row: Record<string, unknown> = { updated_at: nowIso() }

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    const name = String(payload.name || '').trim()
    if (!name) throw new OpsError('Product name is required.')
    row.name = name
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'unit_price')) {
    const unit_price = Number(payload.unit_price)
    if (!(unit_price >= 0)) throw new OpsError('Unit price must be zero or greater.')
    row.unit_price = unit_price
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'active')) {
    row.active = Boolean(payload.active)
  }

  if (
    !Object.prototype.hasOwnProperty.call(payload, 'name') &&
    !Object.prototype.hasOwnProperty.call(payload, 'unit_price') &&
    !Object.prototype.hasOwnProperty.call(payload, 'active')
  ) {
    throw new OpsError('Nothing to update.')
  }

  const { data, error } = await sb.from('products').update(row).eq('id', id).select().single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_product = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  if (!id) throw new OpsError('Product id is required.')

  const checks = [
    { table: 'stock_movements', label: 'stock movements' },
    { table: 'purchase_order_lines', label: 'purchase orders' },
    { table: 'trackable_item_components', label: 'tracking catalog packages' },
    { table: 'quotation_lines', label: 'quotations' },
    { table: 'invoice_lines', label: 'invoices' },
  ]

  for (const check of checks) {
    const { count, error } = await sb
      .from(check.table)
      .select('id', { count: 'exact', head: true })
      .eq('product_id', id)
    if (error) {
      const msg = String(error.message || '').toLowerCase()
      if (msg.includes('does not exist') || msg.includes('could not find')) continue
      throw mapDbError(error)
    }
    if ((count || 0) > 0) {
      throw new OpsError(
        `This product is used on ${check.label}. Deactivate it instead of deleting.`,
      )
    }
  }

  const { error } = await sb.from('products').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return true
}

handlers.create_product = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const payload = (args[0] || {}) as Record<string, unknown>
  const sku = String(payload.sku || '').trim()
  const name = String(payload.name || '').trim()
  if (!sku) throw new OpsError('SKU is required.')
  if (!name) throw new OpsError('Product name is required.')
  const allowedKinds = ['hardware', 'monthly_fee', 'usage']
  let productKind = String(payload.product_kind || '').trim()
  if (!allowedKinds.includes(productKind)) {
    productKind = payload.tracks_stock ? 'hardware' : 'monthly_fee'
  }
  const row = {
    sku,
    name,
    unit_price: Math.max(0, Number(payload.unit_price) || 0),
    product_kind: productKind,
    tracks_stock: productKind === 'hardware',
    active: payload.active !== false,
  }
  const { data, error } = await sb.from('products').insert(row).select().single()
  if (error) throw mapDbError(error)
  return data
}

handlers.list_trackable_items = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { activeOnly?: boolean; withComponents?: boolean }
  return listTrackableItemsInternal(sb, opts)
}

handlers.save_trackable_item = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const { id, name, blurb, active, sort_order } = (args[0] || {}) as Record<string, unknown>
  const row = {
    name: String(name || '').trim(),
    blurb: String(blurb || '').trim() || null,
    active: active !== false,
    sort_order: Number(sort_order) || 0,
    updated_at: nowIso(),
  }
  if (!row.name) throw new OpsError('Name is required.')
  if (id) {
    const { data, error } = await sb
      .from('trackable_items')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw mapDbError(error)
    return data
  }
  const { data, error } = await sb.from('trackable_items').insert(row).select().single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_trackable_item = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  const { error } = await sb.from('trackable_items').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return { id }
}

handlers.save_trackable_item_components = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const trackableItemId = String(args[0] || '')
  const components = (args[1] || []) as Record<string, unknown>[]
  if (!trackableItemId) throw new OpsError('Trackable item is required.')

  const cleaned: Record<string, unknown>[] = []
  const seen = new Set<string>()
  for (const [i, c] of components.entries()) {
    const product_id = c.product_id ? String(c.product_id) : null
    if (!product_id) continue
    if (seen.has(product_id)) {
      throw new OpsError('Each product can only appear once in a package.')
    }
    seen.add(product_id)
    const quantity = Number(c.quantity)
    if (!(quantity > 0)) {
      throw new OpsError('Component quantity must be greater than zero.')
    }
    cleaned.push({
      trackable_item_id: trackableItemId,
      product_id,
      quantity,
      sort_order: Number(c.sort_order) || (i + 1) * 10,
    })
  }

  if (cleaned.length) {
    const productIds = cleaned.map((c) => String(c.product_id))
    const { data: products, error: pErr } = await sb
      .from('products')
      .select('id, sku, name, product_kind, tracks_stock, active')
      .in('id', productIds)
    if (pErr) throw mapDbError(pErr)
    const byId = Object.fromEntries((products || []).map((p) => [p.id, p]))
    for (const line of cleaned) {
      const p = byId[String(line.product_id)] as
        | {
            id: string
            sku: string
            product_kind?: string
            tracks_stock?: boolean
            active?: boolean
          }
        | undefined
      if (!p) throw new OpsError('One of the products was not found.')
      if (p.active === false) {
        throw new OpsError(`${p.sku} is inactive and cannot be used in a bundle.`)
      }
      const kind = p.product_kind || (p.tracks_stock ? 'hardware' : 'monthly_fee')
      if (kind === 'usage') {
        throw new OpsError(
          `${p.sku} is a usage charge — add it on invoices when it occurs, not in catalog bundles.`,
        )
      }
      if (kind !== 'hardware' && kind !== 'monthly_fee') {
        throw new OpsError(`${p.sku} cannot be used in a catalog bundle.`)
      }
    }
  }

  const { error: delErr } = await sb
    .from('trackable_item_components')
    .delete()
    .eq('trackable_item_id', trackableItemId)
  if (delErr) throw mapDbError(delErr)

  if (cleaned.length) {
    const { error: insErr } = await sb.from('trackable_item_components').insert(cleaned)
    if (insErr) throw mapDbError(insErr)
  }

  return listTrackableItemsInternal(sb, { withComponents: true })
}

handlers.create_portal_quotation_from_catalog = async ({ user, sb }, args) => {
  const { client_id, selections, notes } = (args[0] || {}) as Record<string, unknown>
  const clientId = enforcePortalClient(user, client_id ? String(client_id) : null)
  const lines = await linesFromCatalogSelectionsInternal(
    sb,
    (selections || []) as Record<string, unknown>[],
  )
  return saveQuotationInternal(sb, {
    client_id: clientId,
    notes,
    status: 'draft',
    source: 'portal',
    lines,
    discount_amount: 0,
  })
}

handlers.update_portal_quotation_from_catalog = async ({ user, sb }, args) => {
  const { id, client_id, selections, notes } = (args[0] || {}) as Record<string, unknown>
  const clientId = enforcePortalClient(user, client_id ? String(client_id) : null)
  if (!id || !clientId) throw new OpsError('No quotation selected.')

  const existing = await getQuotationInternal(sb, String(id))
  if (String(existing.client_id) !== clientId) throw new OpsError('Quotation not found.', 404)
  if (existing.source !== 'portal' || existing.status !== 'draft') {
    throw new OpsError('This quotation can no longer be edited.')
  }

  const lines = await linesFromCatalogSelectionsInternal(
    sb,
    (selections || []) as Record<string, unknown>[],
  )
  return saveQuotationInternal(sb, {
    id,
    client_id: clientId,
    notes,
    status: 'draft',
    source: 'portal',
    lines,
    discount_amount: existing.discount_amount || 0,
    issue_date: existing.issue_date,
  })
}

handlers.delete_quotation_for_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  if (!id || !clientId) throw new OpsError('No quotation selected.')

  const existing = await getQuotationInternal(sb, id)
  if (String(existing.client_id) !== clientId) throw new OpsError('Quotation not found.', 404)
  if (existing.source !== 'portal' || existing.status !== 'draft') {
    throw new OpsError('This quotation can no longer be deleted.')
  }

  const { error } = await sb.from('quotations').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return true
}

handlers.get_stock_levels = async ({ sb }) => {
  const { data, error } = await sb.from('stock_levels').select('*').order('sku', { ascending: true })
  if (error) throw mapDbError(error)
  return data || []
}

handlers.adjust_stock = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const { productId, quantityDelta, note } = (args[0] || {}) as Record<string, unknown>
  const delta = Number(quantityDelta)
  if (!productId || !Number.isInteger(delta) || delta === 0) {
    throw new OpsError('Enter a non-zero whole number quantity.')
  }

  if (delta < 0) {
    const { data: levels, error: levelErr } = await sb
      .from('stock_levels')
      .select('on_hand')
      .eq('product_id', productId)
      .maybeSingle()
    if (levelErr) throw mapDbError(levelErr)
    const onHand = Number(levels?.on_hand) || 0
    if (onHand + delta < 0) {
      throw new OpsError(`Insufficient stock (on hand: ${onHand}).`)
    }
  }

  const { data, error } = await sb
    .from('stock_movements')
    .insert({
      product_id: productId,
      quantity_delta: delta,
      reason: 'adjustment',
      note: note ? String(note).trim() : null,
    })
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.list_stock_adjustments = async ({ sb }) => {
  const { data, error } = await sb
    .from('stock_movements')
    .select('id, product_id, quantity_delta, note, created_at, products(sku, name)')
    .eq('reason', 'adjustment')
    .order('created_at', { ascending: false })
  if (error) throw mapDbError(error)
  return data || []
}

handlers.list_purchase_orders = async ({ sb }, args) => {
  const { status } = (args[0] || {}) as { status?: string }
  let q = sb
    .from('purchase_orders')
    .select('*, purchase_order_lines(id, product_id, quantity_ordered, quantity_received)')
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_purchase_order = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getPurchaseOrderInternal(sb, id)
}

handlers.create_purchase_order = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const {
    purchase_date,
    supplier,
    amount,
    method,
    reference,
    notes,
    lines,
  } = (args[0] || {}) as Record<string, unknown>
  const amt = Number(amount)
  if (!(amt > 0)) throw new OpsError('Enter the amount paid (greater than zero).')
  if (!purchase_date) throw new OpsError('Choose the date money left the account.')

  const cleaned = ((lines || []) as Record<string, unknown>[])
    .map((l) => ({
      product_id: l.product_id,
      quantity_ordered: Math.trunc(Number(l.quantity_ordered)),
      unit_cost: l.unit_cost === '' || l.unit_cost == null ? null : Number(l.unit_cost),
    }))
    .filter((l) => l.product_id && l.quantity_ordered > 0)

  if (cleaned.length === 0) {
    throw new OpsError('Add at least one product with quantity ordered.')
  }

  const productIds = cleaned.map((l) => l.product_id)
  const { data: products, error: pErr } = await sb
    .from('products')
    .select('id, sku, tracks_stock, active')
    .in('id', productIds)
  if (pErr) throw mapDbError(pErr)
  const byId = Object.fromEntries((products || []).map((p) => [p.id, p]))
  for (const line of cleaned) {
    const p = byId[line.product_id as string]
    if (!p) throw new OpsError('One of the products was not found.')
    if (!p.tracks_stock) {
      throw new OpsError(
        `${p.sku} does not track stock — only stocked products can be on a purchase order.`,
      )
    }
  }

  const { data: po, error: poErr } = await sb
    .from('purchase_orders')
    .insert({
      purchase_date,
      supplier: supplier ? String(supplier).trim() : null,
      amount: amt,
      method: method || 'eft',
      reference: reference ? String(reference).trim() : null,
      notes: notes ? String(notes).trim() : null,
      status: 'open',
    })
    .select()
    .single()
  if (poErr) throw mapDbError(poErr)

  const lineRows = cleaned.map((l) => ({
    purchase_order_id: (po as Record<string, unknown>).id,
    product_id: l.product_id,
    quantity_ordered: l.quantity_ordered,
    quantity_received: 0,
    unit_cost:
      l.unit_cost != null && Number.isFinite(l.unit_cost) && (l.unit_cost as number) >= 0
        ? l.unit_cost
        : null,
  }))

  const { error: lineErr } = await sb.from('purchase_order_lines').insert(lineRows)
  if (lineErr) {
    await sb.from('purchase_orders').delete().eq('id', (po as Record<string, unknown>).id)
    throw mapDbError(lineErr)
  }

  return getPurchaseOrderInternal(sb, String((po as Record<string, unknown>).id))
}

handlers.receive_purchase_order = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const { purchase_order_id, received_date, notes, lines } = (args[0] || {}) as Record<
    string,
    unknown
  >
  if (!purchase_order_id) throw new OpsError('Purchase order is required.')
  if (!received_date) throw new OpsError('Choose the date stock was received.')

  const po = await getPurchaseOrderInternal(sb, String(purchase_order_id))
  if (!po || po.status !== 'open') {
    throw new OpsError('Only open purchase orders can receive stock.')
  }

  const poLines = (po.purchase_order_lines || []) as Record<string, unknown>[]
  const byLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))

  const cleaned = ((lines || []) as Record<string, unknown>[])
    .map((l) => ({
      purchase_order_line_id: l.purchase_order_line_id,
      quantity: Math.trunc(Number(l.quantity)),
    }))
    .filter((l) => l.purchase_order_line_id && l.quantity > 0)

  if (cleaned.length === 0) throw new OpsError('Enter at least one quantity received.')

  for (const row of cleaned) {
    const line = byLineId[row.purchase_order_line_id as string] as Record<string, unknown>
    if (!line) throw new OpsError('A receive line does not belong to this PO.')
    const remaining = Number(line.quantity_ordered) - Number(line.quantity_received)
    if (row.quantity > remaining) {
      const prod = relName(line, 'products')
      const sku = prod?.sku || 'item'
      throw new OpsError(
        `Cannot receive ${row.quantity} of ${sku} — only ${remaining} still outstanding.`,
      )
    }
  }

  const { data: receipt, error: rErr } = await sb
    .from('purchase_receipts')
    .insert({
      purchase_order_id,
      received_date,
      notes: notes ? String(notes).trim() : null,
    })
    .select()
    .single()
  if (rErr) throw mapDbError(rErr)

  const receiptLines = cleaned.map((row) => {
    const line = byLineId[row.purchase_order_line_id as string] as Record<string, unknown>
    return {
      purchase_receipt_id: (receipt as Record<string, unknown>).id,
      purchase_order_line_id: row.purchase_order_line_id,
      product_id: line.product_id,
      quantity: row.quantity,
    }
  })

  const { error: rlErr } = await sb.from('purchase_receipt_lines').insert(receiptLines)
  if (rlErr) {
    await sb.from('purchase_receipts').delete().eq('id', (receipt as Record<string, unknown>).id)
    throw mapDbError(rlErr)
  }

  for (const row of cleaned) {
    const line = byLineId[row.purchase_order_line_id as string] as Record<string, unknown>
    const nextReceived = Number(line.quantity_received) + row.quantity
    const { error: uErr } = await sb
      .from('purchase_order_lines')
      .update({ quantity_received: nextReceived })
      .eq('id', line.id)
    if (uErr) throw mapDbError(uErr)

    const { error: mErr } = await sb.from('stock_movements').insert({
      product_id: line.product_id,
      quantity_delta: row.quantity,
      reason: 'purchase_receive',
      note: `PO ${po.po_number}`,
      reference_type: 'purchase_receipt',
      reference_id: (receipt as Record<string, unknown>).id,
    })
    if (mErr) throw mapDbError(mErr)
    line.quantity_received = nextReceived
  }

  const fullyReceived = poLines.every(
    (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
  )
  if (fullyReceived) {
    const { error: sErr } = await sb
      .from('purchase_orders')
      .update({ status: 'closed', updated_at: nowIso() })
      .eq('id', purchase_order_id)
    if (sErr) throw mapDbError(sErr)
  } else {
    await sb.from('purchase_orders').update({ updated_at: nowIso() }).eq('id', purchase_order_id)
  }

  return getPurchaseOrderInternal(sb, String(purchase_order_id))
}

handlers.update_purchase_receipt = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const { id, received_date, notes, lines } = (args[0] || {}) as Record<string, unknown>
  if (!id) throw new OpsError('Delivery is required.')
  if (!received_date) throw new OpsError('Choose the date stock was received.')

  const { data: receipt, error: rErr } = await sb
    .from('purchase_receipts')
    .select(
      `*,
      purchase_receipt_lines(id, purchase_order_line_id, product_id, quantity),
      purchase_orders(id, po_number, status)`,
    )
    .eq('id', id)
    .single()
  if (rErr) throw mapDbError(rErr)

  const poId = (receipt as Record<string, unknown>).purchase_order_id
  const po = await getPurchaseOrderInternal(sb, String(poId))
  const poLines = (po.purchase_order_lines || []) as Record<string, unknown>[]
  const byPoLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))
  const oldLines = ((receipt as Record<string, unknown>).purchase_receipt_lines ||
    []) as Record<string, unknown>[]
  const byReceiptLineId = Object.fromEntries(oldLines.map((l) => [l.id, l]))

  const cleaned = ((lines || []) as Record<string, unknown>[])
    .map((l) => ({
      id: l.id,
      purchase_order_line_id: l.purchase_order_line_id,
      quantity: Math.trunc(Number(l.quantity)),
    }))
    .filter((l) => l.id && byReceiptLineId[l.id as string])

  if (cleaned.length !== oldLines.length) {
    throw new OpsError('Delivery lines are incomplete. Refresh and try again.')
  }

  if (cleaned.every((l) => l.quantity <= 0)) {
    return handlers.cancel_purchase_receipt({ sb, user }, [id])
  }

  for (const row of cleaned) {
    if (row.quantity < 0) throw new OpsError('Quantities cannot be negative.')
    const old = byReceiptLineId[row.id as string] as Record<string, unknown>
    const poLine = byPoLineId[old.purchase_order_line_id as string] as Record<string, unknown>
    if (!poLine) throw new OpsError('A delivery line no longer matches this PO.')
    const oldQty = Number(old.quantity)
    const newQty = row.quantity
    const delta = newQty - oldQty
    if (delta === 0) continue

    if (delta > 0) {
      const remainingExcludingThis =
        Number(poLine.quantity_ordered) - (Number(poLine.quantity_received) - oldQty)
      if (newQty > remainingExcludingThis) {
        const prod = relName(poLine, 'products')
        const sku = prod?.sku || 'item'
        throw new OpsError(
          `Cannot set ${newQty} of ${sku} — only ${remainingExcludingThis} can be on this delivery.`,
        )
      }
    } else {
      const { data: levels, error: levelErr } = await sb
        .from('stock_levels')
        .select('on_hand, sku')
        .eq('product_id', old.product_id)
        .maybeSingle()
      if (levelErr) throw mapDbError(levelErr)
      const onHand = Number(levels?.on_hand) || 0
      if (onHand + delta < 0) {
        const prod = relName(poLine, 'products')
        const sku = levels?.sku || prod?.sku || 'item'
        throw new OpsError(`Cannot reduce ${sku} by ${-delta} — only ${onHand} on hand.`)
      }
    }
  }

  const { error: updErr } = await sb
    .from('purchase_receipts')
    .update({
      received_date,
      notes: notes ? String(notes).trim() : null,
    })
    .eq('id', id)
  if (updErr) throw mapDbError(updErr)

  for (const row of cleaned) {
    const old = byReceiptLineId[row.id as string] as Record<string, unknown>
    const poLine = byPoLineId[old.purchase_order_line_id as string] as Record<string, unknown>
    const oldQty = Number(old.quantity)
    const newQty = row.quantity
    const delta = newQty - oldQty

    if (newQty === 0) {
      const { error: delErr } = await sb.from('purchase_receipt_lines').delete().eq('id', row.id)
      if (delErr) throw mapDbError(delErr)
    } else if (delta !== 0) {
      const { error: lineUpdErr } = await sb
        .from('purchase_receipt_lines')
        .update({ quantity: newQty })
        .eq('id', row.id)
      if (lineUpdErr) throw mapDbError(lineUpdErr)
    }

    if (delta !== 0) {
      const nextReceived = Number(poLine.quantity_received) + delta
      const { error: poLineErr } = await sb
        .from('purchase_order_lines')
        .update({ quantity_received: nextReceived })
        .eq('id', poLine.id)
      if (poLineErr) throw mapDbError(poLineErr)
      poLine.quantity_received = nextReceived

      const { error: mErr } = await sb.from('stock_movements').insert({
        product_id: old.product_id,
        quantity_delta: delta,
        reason: delta > 0 ? 'purchase_receive' : 'purchase_receive_adjust',
        note: `PO ${po.po_number} (edit delivery)`,
        reference_type: 'purchase_receipt',
        reference_id: id,
      })
      if (mErr) throw mapDbError(mErr)
    }
  }

  const fullyReceived = poLines.every(
    (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
  )
  const nextStatus = fullyReceived ? 'closed' : 'open'
  if (po.status !== nextStatus) {
    const { error: sErr } = await sb
      .from('purchase_orders')
      .update({ status: nextStatus, updated_at: nowIso() })
      .eq('id', poId)
    if (sErr) throw mapDbError(sErr)
  } else {
    await sb.from('purchase_orders').update({ updated_at: nowIso() }).eq('id', poId)
  }

  return getPurchaseOrderInternal(sb, String(poId))
}

handlers.cancel_purchase_receipt = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  if (!id) throw new OpsError('Delivery is required.')

  const { data: receipt, error: rErr } = await sb
    .from('purchase_receipts')
    .select(`*, purchase_receipt_lines(id, purchase_order_line_id, product_id, quantity)`)
    .eq('id', id)
    .single()
  if (rErr) throw mapDbError(rErr)

  const poId = (receipt as Record<string, unknown>).purchase_order_id
  const po = await getPurchaseOrderInternal(sb, String(poId))
  const poLines = (po.purchase_order_lines || []) as Record<string, unknown>[]
  const byPoLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))
  const receiptLines = ((receipt as Record<string, unknown>).purchase_receipt_lines ||
    []) as Record<string, unknown>[]

  for (const row of receiptLines) {
    const qty = Number(row.quantity)
    if (!(qty > 0)) continue
    const { data: levels, error: levelErr } = await sb
      .from('stock_levels')
      .select('on_hand, sku')
      .eq('product_id', row.product_id)
      .maybeSingle()
    if (levelErr) throw mapDbError(levelErr)
    const onHand = Number(levels?.on_hand) || 0
    if (onHand < qty) {
      const poLine = byPoLineId[row.purchase_order_line_id as string] as Record<string, unknown>
      const prod = relName(poLine, 'products')
      const sku = levels?.sku || prod?.sku || 'item'
      throw new OpsError(
        `Cannot cancel this delivery — ${sku} only has ${onHand} on hand (need to reverse ${qty}).`,
      )
    }
  }

  for (const row of receiptLines) {
    const qty = Number(row.quantity)
    const poLine = byPoLineId[row.purchase_order_line_id as string] as Record<string, unknown>
    if (!poLine) throw new OpsError('A delivery line no longer matches this PO.')

    const nextReceived = Math.max(0, Number(poLine.quantity_received) - qty)
    const { error: uErr } = await sb
      .from('purchase_order_lines')
      .update({ quantity_received: nextReceived })
      .eq('id', poLine.id)
    if (uErr) throw mapDbError(uErr)
    poLine.quantity_received = nextReceived

    if (qty > 0) {
      const { error: mErr } = await sb.from('stock_movements').insert({
        product_id: row.product_id,
        quantity_delta: -qty,
        reason: 'purchase_receive_cancel',
        note: `PO ${po.po_number} (cancel delivery)`,
        reference_type: 'purchase_receipt',
        reference_id: id,
      })
      if (mErr) throw mapDbError(mErr)
    }
  }

  const { error: delErr } = await sb.from('purchase_receipts').delete().eq('id', id)
  if (delErr) throw mapDbError(delErr)

  const fullyReceived = poLines.every(
    (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
  )
  const { error: sErr } = await sb
    .from('purchase_orders')
    .update({
      status: fullyReceived ? 'closed' : 'open',
      updated_at: nowIso(),
    })
    .eq('id', poId)
  if (sErr) throw mapDbError(sErr)

  return getPurchaseOrderInternal(sb, String(poId))
}

handlers.get_settings = async ({ sb }) => getSettingsInternal(sb)

handlers.update_settings = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const payload = (args[0] || {}) as Record<string, unknown>
  const row = {
    company_name: payload.company_name ? String(payload.company_name).trim() : 'iTreq Inc',
    currency: payload.currency ? String(payload.currency).trim() : 'BWP',
    quote_prefix: payload.quote_prefix ? String(payload.quote_prefix).trim() : 'Q',
    invoice_prefix: payload.invoice_prefix ? String(payload.invoice_prefix).trim() : 'INV',
    next_quote_number: Math.max(1, Number(payload.next_quote_number) || 1),
    next_invoice_number: Math.max(1, Number(payload.next_invoice_number) || 1),
    default_tax_rate: Math.max(0, Number(payload.default_tax_rate) || 0),
    letterhead_address: payload.letterhead_address ? String(payload.letterhead_address).trim() : null,
    letterhead_phone: payload.letterhead_phone ? String(payload.letterhead_phone).trim() : null,
    letterhead_email: payload.letterhead_email ? String(payload.letterhead_email).trim() : null,
    banking_details: payload.banking_details ? String(payload.banking_details).trim() : null,
    updated_at: nowIso(),
  }
  const { data, error } = await sb.from('company_settings').update(row).eq('id', 1).select().single()
  if (error) throw mapDbError(error)
  return data
}

handlers.list_quotations = async ({ sb }, args) => {
  const { client_id } = (args[0] || {}) as { client_id?: string }
  let query = sb
    .from('quotations')
    .select('*, clients(name), contact_submissions(name)')
    .order('created_at', { ascending: false })
  if (client_id) query = query.eq('client_id', client_id)
  const { data, error } = await query
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_quotation = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getQuotationInternal(sb, id)
}

handlers.get_quotation_for_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  const res = await getQuotationInternal(sb, id)
  if (String(res.client_id) !== clientId) throw new OpsError('Quotation not found.', 404)
  return res
}

handlers.save_quotation = async ({ user, sb }, args) => {
  const payload = (args[0] || {}) as Record<string, unknown>
  if (payload.client_id) assertNotOwnClient(user, String(payload.client_id))
  return saveQuotationInternal(sb, payload)
}

handlers.set_quotation_status = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const status = args[1]
  const { data, error } = await sb
    .from('quotations')
    .update({ status, updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.mark_quotation_sent = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const existing = await getQuotationInternal(sb, id)
  const status = String(existing.status)
  if (status === 'converted' || status === 'cancelled' || status === 'sent') return existing
  const { data, error } = await sb
    .from('quotations')
    .update({ status: 'sent', updated_at: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.convert_quotation_to_invoice = async ({ user, sb }, args) => {
  const quotationId = String(args[0] || '')
  const quote = await getQuotationInternal(sb, quotationId)
  if (!quote.client_id) {
    throw new OpsError('Convert this lead to a client before creating an invoice.')
  }
  assertNotOwnClient(user, String(quote.client_id))
  if (quote.status === 'converted') {
    throw new OpsError('This quotation was already converted.')
  }
  if (quote.status === 'cancelled') {
    throw new OpsError('Cannot convert a cancelled quotation.')
  }

  const inv = await saveInvoiceInternal(sb, {
    client_id: quote.client_id,
    quotation_id: quote.id,
    notes: quote.notes,
    discount_amount: quote.discount_amount,
    lines: quote.lines,
    status: 'draft',
    issue_date: localTodayIso(),
  })

  const { error } = await sb
    .from('quotations')
    .update({
      status: 'converted',
      converted_invoice_id: inv.id,
      updated_at: nowIso(),
    })
    .eq('id', quotationId)
  if (error) throw mapDbError(error)
  return inv
}

handlers.list_invoices = async ({ sb }, args) => {
  const { client_id, forPortal = false } = (args[0] || {}) as {
    client_id?: string
    forPortal?: boolean
  }
  let query = sb
    .from('invoices')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
  if (client_id) query = query.eq('client_id', client_id)
  if (forPortal) query = query.in('status', [...BALANCE_INVOICE_STATUSES])
  const { data, error } = await query
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_invoice = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getInvoiceInternal(sb, id)
}

handlers.get_invoice_for_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  const res = await getInvoiceInternal(sb, id)
  if (String(res.client_id) !== clientId || !invoiceAffectsClientBalance(String(res.status))) {
    throw new OpsError('Invoice not found.', 404)
  }
  return res
}

handlers.save_invoice = async ({ user, sb }, args) => {
  const payload = (args[0] || {}) as Record<string, unknown>
  if (payload.client_id) assertNotOwnClient(user, String(payload.client_id))
  return saveInvoiceInternal(sb, payload)
}

handlers.issue_invoice = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const existing = await getInvoiceInternal(sb, id)
  assertNotOwnClient(user, String(existing.client_id))
  const { error } = await sb.rpc('issue_invoice', { p_invoice_id: id })
  if (error) throw mapDbError(error)
  return getInvoiceInternal(sb, id)
}

handlers.void_invoice = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const existing = await getInvoiceInternal(sb, id)
  assertNotOwnClient(user, String(existing.client_id))
  const { error } = await sb.rpc('void_invoice', { p_invoice_id: id })
  if (error) throw mapDbError(error)
  return getInvoiceInternal(sb, id)
}

handlers.delete_invoice = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  const existing = await getInvoiceInternal(sb, id)
  assertNotOwnClient(user, String(existing.client_id))

  const status = String(existing.status)
  if (status === 'draft') {
    // Drafts have no stock movement or payments.
  } else if (status === 'void') {
    const { count, error: cErr } = await sb
      .from('payment_allocations')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', id)
    if (cErr) throw mapDbError(cErr)
    if ((count || 0) > 0) {
      throw new OpsError('Cannot delete this invoice — payment records still reference it.')
    }
  } else {
    throw new OpsError(
      'Only draft invoices can be deleted, or void invoices with no payments. Void active invoices first.',
    )
  }

  // Reopen source quotation (if any) before delete — FK only nulls converted_invoice_id.
  const { error: byConvertedErr } = await sb
    .from('quotations')
    .update({
      status: 'draft',
      converted_invoice_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('converted_invoice_id', id)
    .eq('status', 'converted')
  if (byConvertedErr) throw mapDbError(byConvertedErr)

  if (existing.quotation_id) {
    const { error: byLinkErr } = await sb
      .from('quotations')
      .update({
        status: 'draft',
        converted_invoice_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.quotation_id)
      .eq('status', 'converted')
    if (byLinkErr) throw mapDbError(byLinkErr)
  }

  const { error } = await sb.from('invoices').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return { ok: true }
}

handlers.preview_monthly_fee_run = async ({ sb }, args) => {
  const { billing_period } = (args[0] || {}) as { billing_period?: string }
  if (!billing_period) throw new OpsError('Choose a billing month.')
  const { data, error } = await sb.rpc('preview_monthly_fee_invoices', {
    p_billing_period: billing_period,
  })
  if (error) throw mapDbError(error)
  return data
}

handlers.generate_monthly_fee_invoices = async ({ sb }, args) => {
  const { billing_period } = (args[0] || {}) as { billing_period?: string }
  if (!billing_period) throw new OpsError('Choose a billing month.')
  const { data, error } = await sb.rpc('generate_monthly_fee_invoices', {
    p_billing_period: billing_period,
  })
  if (error) throw mapDbError(error)
  return data
}

handlers.get_billing_document_bundle = async ({ sb }, args) => {
  const documentType = String(args[0] || '')
  const id = String(args[1] || '')
  return getBillingDocumentBundleInternal(sb, documentType, id)
}

handlers.get_billing_document_bundle_for_client = async ({ user, sb }, args) => {
  const documentType = String(args[0] || '')
  const id = String(args[1] || '')
  const clientId = enforcePortalClient(user, args[2] ? String(args[2]) : null)
  const type = documentType === 'invoice' ? 'invoice' : 'quote'
  if (type === 'invoice') {
    const inv = await getInvoiceInternal(sb, id)
    if (String(inv.client_id) !== clientId) throw new OpsError('Invoice not found.', 404)
  } else {
    const quote = await getQuotationInternal(sb, id)
    if (String(quote.client_id) !== clientId) throw new OpsError('Quotation not found.', 404)
  }
  return getBillingDocumentBundleInternal(sb, type, id)
}

handlers.send_billing_document_email = async ({ sb }, args) => {
  const documentType = String(args[0] || '')
  const id = String(args[1] || '')
  const bundle = await getBillingDocumentBundleInternal(sb, documentType, id)
  const type = bundle.type === 'invoice' ? 'Invoice' : 'Estimate'
  const doc = bundle.doc as Record<string, unknown>
  const client = bundle.client as Record<string, unknown>
  const settings = bundle.settings as Record<string, unknown>
  const to = client.email ? String(client.email).trim() : ''
  if (!to) throw new OpsError('This client has no email address on file.')
  const companyName = settings.company_name ? String(settings.company_name).trim() : 'iTreq Inc'
  const docNumber = doc.number ? String(doc.number) : 'Draft'
  const subject = `${type} ${docNumber} — ${companyName}`
  const plainText = `${type} ${docNumber}\nTotal: ${doc.total}\n\n— ${companyName}`
  await sendViaResend(to, subject, simpleEmailHtml(subject, plainText), plainText)
  return { ok: true }
}

handlers.list_payments = async ({ sb }) => {
  const { data, error } = await sb
    .from('payments')
    .select('*, clients(name)')
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw mapDbError(error)
  return data || []
}

handlers.list_open_invoices_for_client = async ({ user, sb }, args) => {
  const clientId = String(args[0] || '')
  assertNotOwnClient(user, clientId)
  const { editingPaymentId = null } = (args[1] || {}) as { editingPaymentId?: string | null }

  const { data, error } = await sb
    .from('invoices')
    .select('*')
    .eq('client_id', clientId)
    .in('status', ['issued', 'partial', 'paid'])
    .order('issue_date', { ascending: true })
  if (error) throw mapDbError(error)

  let currentAlloc: Record<string, number> = {}
  if (editingPaymentId) {
    const { data: allocs, error: allocErr } = await sb
      .from('payment_allocations')
      .select('invoice_id, amount')
      .eq('payment_id', editingPaymentId)
    if (allocErr) throw mapDbError(allocErr)
    for (const a of allocs || []) {
      currentAlloc[String(a.invoice_id)] = Number(a.amount) || 0
    }
  }

  return (data || [])
    .map((inv) => {
      const paid = Number(inv.amount_paid) || 0
      const thisAlloc = currentAlloc[String(inv.id)] || 0
      const due = Math.round((Number(inv.total) - paid + thisAlloc) * 100) / 100
      return { ...inv, _allocatable: due, _current_alloc: thisAlloc }
    })
    .filter((inv) => inv._allocatable > 0.001)
}

handlers.get_payment = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getPaymentInternal(sb, id)
}

handlers.get_payment_for_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  const res = await getPaymentInternal(sb, id)
  if (String(res.client_id) !== clientId) throw new OpsError('Payment not found.', 404)
  return res
}

handlers.get_payment_document_bundle = async ({ sb }, args) => {
  const id = String(args[0] || '')
  return getPaymentDocumentBundleInternal(sb, id)
}

handlers.get_payment_document_bundle_for_client = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  const payment = await getPaymentInternal(sb, id)
  if (String(payment.client_id) !== clientId) throw new OpsError('Payment not found.', 404)
  return getPaymentDocumentBundleInternal(sb, id)
}

handlers.send_payment_document_email = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const bundle = await getPaymentDocumentBundleInternal(sb, id)
  const payment = bundle.payment as Record<string, unknown>
  const client = bundle.client as Record<string, unknown>
  const settings = bundle.settings as Record<string, unknown>
  const to = client.email ? String(client.email).trim() : ''
  if (!to) throw new OpsError('This client has no email address on file.')
  const companyName = settings.company_name ? String(settings.company_name).trim() : 'iTreq Inc'
  const ref = payment.reference ? String(payment.reference) : 'Payment'
  const subject = `Payment receipt ${ref} — ${companyName}`
  const plainText = `Payment receipt\nAmount: ${payment.amount}\nDate: ${payment.payment_date}\n\n— ${companyName}`
  await sendViaResend(to, subject, simpleEmailHtml(subject, plainText), plainText)
  return { ok: true }
}

handlers.record_payment = async ({ user, sb }, args) => {
  const {
    client_id,
    amount,
    payment_date,
    method,
    reference,
    notes,
    allocations,
    opening_amount,
  } = (args[0] || {}) as Record<string, unknown>
  if (!client_id) throw new OpsError('Please select a client.')
  assertNotOwnClient(user, String(client_id))
  const payload = ((allocations || []) as Record<string, unknown>[])
    .filter((a) => Number(a.amount) > 0)
    .map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }))
  const { data, error } = await sb.rpc('record_payment', {
    p_client_id: client_id,
    p_amount: Number(amount),
    p_payment_date: payment_date || null,
    p_method: method || 'cash',
    p_reference: reference || null,
    p_notes: notes || null,
    p_allocations: payload,
    p_opening_amount: Math.max(0, Number(opening_amount) || 0),
  })
  if (error) throw mapDbError(error)
  return { id: data }
}

handlers.update_payment = async ({ user, sb }, args) => {
  const {
    id,
    amount,
    payment_date,
    method,
    reference,
    notes,
    allocations,
    opening_amount,
  } = (args[0] || {}) as Record<string, unknown>
  if (!id) throw new OpsError('Payment id is required.')
  const existing = await getPaymentInternal(sb, String(id))
  assertNotOwnClient(user, String(existing.client_id))
  const payload = ((allocations || []) as Record<string, unknown>[])
    .filter((a) => Number(a.amount) > 0)
    .map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }))
  const { data, error } = await sb.rpc('update_payment', {
    p_payment_id: id,
    p_amount: Number(amount),
    p_payment_date: payment_date || null,
    p_method: method || 'cash',
    p_reference: reference || null,
    p_notes: notes || null,
    p_allocations: payload,
    p_opening_amount: Math.max(0, Number(opening_amount) || 0),
  })
  if (error) throw mapDbError(error)
  return { id: data }
}

handlers.delete_payment = async ({ user, sb }, args) => {
  const id = String(args[0] || '')
  const existing = await getPaymentInternal(sb, id)
  assertNotOwnClient(user, String(existing.client_id))
  const { error } = await sb.rpc('delete_payment', { p_payment_id: id })
  if (error) throw mapDbError(error)
  return { ok: true }
}

handlers.get_client_credit_balance = async ({ user, sb }, args) => {
  const bodyId = args[0] ? String(args[0]) : ''
  const clientId = isStaffLike(user)
    ? bodyId
    : enforcePortalClient(user, bodyId || null)
  if (clientId && isStaffLike(user)) assertNotOwnClient(user, clientId)
  if (!clientId) return { balance: 0 }
  const { data, error } = await sb.rpc('get_client_credit_balance', { p_client_id: clientId })
  if (error) throw mapDbError(error)
  return { balance: Number(data) || 0 }
}

handlers.list_client_credit_balances = async ({ sb }, args) => {
  const raw = args[0]
  const ids = Array.isArray(raw)
    ? [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))]
    : []
  if (!ids.length) return {}
  const pairs = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await sb.rpc('get_client_credit_balance', { p_client_id: id })
      if (error) throw mapDbError(error)
      return [id, Number(data) || 0] as const
    }),
  )
  return Object.fromEntries(pairs)
}

/** Unallocated payment leftovers + clients with unpaid invoices (list UI hints). */
handlers.get_payment_list_credit_hints = async ({ sb }) => {
  const [paymentsRes, allocsRes, invoicesRes] = await Promise.all([
    sb.from('payments').select('id, client_id, amount, opening_balance_delta'),
    sb.from('payment_allocations').select('payment_id, amount'),
    sb
      .from('invoices')
      .select('client_id, total, amount_paid, status')
      .in('status', ['issued', 'partial']),
  ])
  if (paymentsRes.error) throw mapDbError(paymentsRes.error)
  if (allocsRes.error) throw mapDbError(allocsRes.error)
  if (invoicesRes.error) throw mapDbError(invoicesRes.error)

  const allocByPayment: Record<string, number> = {}
  for (const row of allocsRes.data || []) {
    const pid = String((row as { payment_id: string }).payment_id)
    allocByPayment[pid] =
      (allocByPayment[pid] || 0) + (Number((row as { amount: number }).amount) || 0)
  }

  const unallocatedByPaymentId: Record<string, number> = {}
  for (const p of paymentsRes.data || []) {
    const row = p as {
      id: string
      amount: number
      opening_balance_delta?: number
    }
    const openingApplied = Math.max(0, -(Number(row.opening_balance_delta) || 0))
    const unallocated =
      Math.round(
        ((Number(row.amount) || 0) - (allocByPayment[row.id] || 0) - openingApplied) * 100,
      ) / 100
    if (unallocated > 0.001) unallocatedByPaymentId[row.id] = unallocated
  }

  const clientIdsWithUnpaidInvoices: string[] = []
  const seen = new Set<string>()
  for (const inv of invoicesRes.data || []) {
    const row = inv as {
      client_id: string
      total: number
      amount_paid: number
    }
    const due = Math.round((Number(row.total) - Number(row.amount_paid)) * 100) / 100
    const cid = String(row.client_id)
    if (due > 0.001 && !seen.has(cid)) {
      seen.add(cid)
      clientIdsWithUnpaidInvoices.push(cid)
    }
  }

  return { unallocatedByPaymentId, clientIdsWithUnpaidInvoices }
}

handlers.apply_client_credit_to_invoice = async ({ user, sb }, args) => {
  const invoiceId = String(args[0] || '')
  const amount = args[1] != null ? Number(args[1]) : null
  const invoice = await getInvoiceInternal(sb, invoiceId)
  assertNotOwnClient(user, String(invoice.client_id))
  const { data, error } = await sb.rpc('apply_client_credit_to_invoice', {
    p_invoice_id: invoiceId,
    p_amount: amount,
  })
  if (error) throw mapDbError(error)
  return { applied: Number(data) || 0 }
}

handlers.list_opening_balance_clients = async ({ user, sb }, args) => {
  const opts = (args[0] || {}) as { activeOnly?: boolean }
  const activeOnly = opts.activeOnly !== false
  let q = sb
    .from('clients')
    .select('id, name, email, phone, cellphone, opening_balance, opening_balance_date, is_active')
    .order('name', { ascending: true })
  if (activeOnly) q = q.eq('is_active', true)
  const [clientRes, payRes] = await Promise.all([
    q,
    sb.from('payments').select('client_id, opening_balance_delta').neq('opening_balance_delta', 0),
  ])
  if (clientRes.error) throw mapDbError(clientRes.error)
  if (payRes.error) throw mapDbError(payRes.error)
  const remainingById = openingBalanceRemainingMap(
    (clientRes.data || []) as Record<string, unknown>[],
    (payRes.data || []) as Record<string, unknown>[],
  )
  const ownId = portalClientId(user)
  const clients = (clientRes.data || [])
    .filter((c) => String(c.id) !== String(ownId || ''))
    .map((c) => ({
      ...c,
      opening_balance_remaining: remainingById[String(c.id)] || 0,
    }))
    .filter((c) => Math.abs(Number(c.opening_balance_remaining) || 0) > 0.001)
  const withCredit = []
  for (const c of clients) {
    const { data: credit, error: creditErr } = await sb.rpc('get_client_credit_balance', {
      p_client_id: c.id,
    })
    if (creditErr) throw mapDbError(creditErr)
    withCredit.push({
      ...c,
      account_credit: Number(credit) || 0,
    })
  }
  return withCredit
}

handlers.apply_payment_to_opening_balance = async ({ user, sb }, args) => {
  const {
    client_id,
    amount,
    payment_date,
    method,
    reference,
    notes,
  } = (args[0] || {}) as Record<string, unknown>
  if (!client_id) throw new OpsError('Please select a client.')
  assertNotOwnClient(user, String(client_id))
  const { data, error } = await sb.rpc('apply_payment_to_opening_balance', {
    p_client_id: client_id,
    p_amount: Number(amount),
    p_payment_date: payment_date || null,
    p_method: method || 'cash',
    p_reference: reference || null,
    p_notes: notes || null,
  })
  if (error) throw mapDbError(error)
  return { id: data }
}

handlers.apply_opening_credit_to_invoice = async ({ user, sb }, args) => {
  const clientId = String(args[0] || '')
  const invoiceId = String(args[1] || '')
  const amount = args[2] != null ? Number(args[2]) : null
  if (!clientId || !invoiceId) throw new OpsError('Client and invoice are required.')
  assertNotOwnClient(user, clientId)
  const { data, error } = await sb.rpc('apply_opening_credit_to_invoice', {
    p_client_id: clientId,
    p_invoice_id: invoiceId,
    p_amount: amount,
  })
  if (error) throw mapDbError(error)
  return { applied: Number(data) || 0 }
}

handlers.apply_opening_credit_to_invoices = async ({ user, sb }, args) => {
  const clientId = String(args[0] || '')
  const allocations = (args[1] || []) as Record<string, unknown>[]
  if (!clientId) throw new OpsError('Client is required.')
  assertNotOwnClient(user, clientId)
  const payload = allocations
    .filter((a) => Number(a.amount) > 0)
    .map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }))
  if (!payload.length) throw new OpsError('Select at least one invoice.')
  const { data, error } = await sb.rpc('apply_opening_credit_to_invoices', {
    p_client_id: clientId,
    p_allocations: payload,
  })
  if (error) throw mapDbError(error)
  return { applied: Number(data) || 0 }
}

handlers.apply_client_credit_to_opening_balance = async ({ user, sb }, args) => {
  const clientId = String(args[0] || '')
  const amount = args[1] != null ? Number(args[1]) : null
  if (!clientId) throw new OpsError('Client is required.')
  assertNotOwnClient(user, clientId)
  const { data, error } = await sb.rpc('apply_client_credit_to_opening_balance', {
    p_client_id: clientId,
    p_amount: amount,
  })
  if (error) throw mapDbError(error)
  return { applied: Number(data) || 0 }
}

handlers.get_client_opening_balance_applied = async ({ user, sb }, args) => {
  const clientId = String(args[0] || '')
  if (!clientId) return { paidTowardOpening: 0, creditAppliedToInvoices: 0 }
  assertNotOwnClient(user, clientId)
  const { data, error } = await sb
    .from('payments')
    .select('opening_balance_delta')
    .eq('client_id', clientId)
    .neq('opening_balance_delta', 0)
  if (error) throw mapDbError(error)
  let paidTowardOpening = 0
  let creditAppliedToInvoices = 0
  for (const row of data || []) {
    const delta = Number(row.opening_balance_delta) || 0
    if (delta < 0) paidTowardOpening += -delta
    else if (delta > 0) creditAppliedToInvoices += delta
  }
  return {
    paidTowardOpening: Math.round(paidTowardOpening * 100) / 100,
    creditAppliedToInvoices: Math.round(creditAppliedToInvoices * 100) / 100,
  }
}

handlers.get_income_report = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { from?: string; to?: string }
  return getIncomeReportInternal(sb, opts)
}

handlers.get_expenses_report = async ({ sb }, args) => {
  const opts = (args[0] || {}) as { from?: string; to?: string }
  return getExpensesReportInternal(sb, opts)
}

handlers.get_expected_vs_collected_report = async ({ sb }, args) => {
  const { from, to } = (args[0] || {}) as { from?: string; to?: string }

  let invQ = sb
    .from('invoices')
    .select('id, number, issue_date, status, total, amount_paid, clients(name)')
    .in('status', ['issued', 'partial', 'paid'])
    .order('issue_date', { ascending: true })
  if (from) invQ = invQ.gte('issue_date', from)
  if (to) invQ = invQ.lte('issue_date', to)

  const [invRes, payRes] = await Promise.all([
    invQ,
    getIncomeReportInternal(sb, { from, to }),
  ])
  if (invRes.error) throw mapDbError(invRes.error)

  const invoices = (invRes.data || []) as Record<string, unknown>[]
  let expected = 0
  let paidOnExpected = 0
  for (const inv of invoices) {
    expected += Number(inv.total) || 0
    paidOnExpected += Number(inv.amount_paid) || 0
  }
  expected = Math.round(expected * 100) / 100
  paidOnExpected = Math.round(paidOnExpected * 100) / 100
  const outstandingOnExpected = Math.round((expected - paidOnExpected) * 100) / 100
  const collected = payRes.total
  const gap = Math.round((expected - collected) * 100) / 100
  const collectionRate = expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null

  return {
    from: from || null,
    to: to || null,
    expected,
    invoiceCount: invoices.length,
    paidOnExpected,
    outstandingOnExpected,
    collected,
    paymentCount: payRes.paymentCount,
    collectedByMethod: payRes.byMethod,
    gap,
    collectionRate,
    invoices: invoices.map((inv) => {
      const client = relName(inv, 'clients')
      return {
        id: inv.id,
        number: inv.number,
        issue_date: inv.issue_date,
        status: inv.status,
        client_name: client?.name || '—',
        total: Number(inv.total) || 0,
        amount_paid: Number(inv.amount_paid) || 0,
        balance: Math.round((Number(inv.total) - Number(inv.amount_paid || 0)) * 100) / 100,
      }
    }),
  }
}

handlers.get_profit_and_loss_report = async ({ sb }, args) => {
  const { from, to } = (args[0] || {}) as { from?: string; to?: string }

  let poQ = sb
    .from('purchase_orders')
    .select('amount, purchase_date, status')
    .neq('status', 'cancelled')
    .order('purchase_date', { ascending: true })
  if (from) poQ = poQ.gte('purchase_date', from)
  if (to) poQ = poQ.lte('purchase_date', to)

  const [incomeRes, expenseRes, poRes] = await Promise.all([
    getIncomeReportInternal(sb, { from, to }),
    getExpensesReportInternal(sb, { from, to }),
    poQ,
  ])
  if (poRes.error) throw mapDbError(poRes.error)

  const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100
  const poRows = (poRes.data || []) as Record<string, unknown>[]
  let stockPurchases = 0
  for (const row of poRows) stockPurchases += Number(row.amount) || 0
  stockPurchases = round(stockPurchases)

  const revenue = incomeRes.total
  const operatingExpenses = expenseRes.total
  const grossProfit = round(revenue - stockPurchases)
  const totalCosts = round(stockPurchases + operatingExpenses)
  const netProfit = round(revenue - totalCosts)
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null

  return {
    from: from || null,
    to: to || null,
    revenue,
    paymentCount: incomeRes.paymentCount,
    stockPurchases,
    purchaseOrderCount: poRows.length,
    operatingExpenses,
    expenseCount: expenseRes.expenseCount,
    grossProfit,
    totalCosts,
    netProfit,
    margin,
    expensesByCategory: expenseRes.byCategory,
  }
}

function scopeClientId(user: UserRow, bodyClientId: string | null | undefined) {
  if (!isStaffLike(user)) {
    return enforcePortalClient(user, bodyClientId)
  }
  if (bodyClientId) assertNotOwnClient(user, bodyClientId)
  return bodyClientId ? String(bodyClientId) : ''
}

handlers.get_client_statement = async ({ user, sb }, args) => {
  const { client_id, from, to } = (args[0] || {}) as {
    client_id?: string
    from?: string
    to?: string
  }
  const scopedId = scopeClientId(user, client_id || null)
  if (!scopedId) throw new OpsError('Please select a client.')

  const client = await getClientInternal(sb, scopedId)

  const { data: allInv, error: invErr } = await sb
    .from('invoices')
    .select('id, number, issue_date, status, total, amount_paid, created_at')
    .eq('client_id', scopedId)
    .in('status', ['draft', 'issued', 'partial', 'paid', 'void'])
    .order('issue_date', { ascending: true })
  if (invErr) throw mapDbError(invErr)

  const { data: allPay, error: payErr } = await sb
    .from('payments')
    .select(
      'id, payment_date, source_date, amount, method, reference, opening_balance_delta, is_adjustment',
    )
    .eq('client_id', scopedId)
    .order('payment_date', { ascending: true })
  if (payErr) throw mapDbError(payErr)

  const { data: allQuotes, error: quoteErr } = await sb
    .from('quotations')
    .select('id, number, issue_date, status, total, created_at, source')
    .eq('client_id', scopedId)
    .order('issue_date', { ascending: true })
  if (quoteErr) throw mapDbError(quoteErr)

  const fromDate = from || '0001-01-01'
  const toDate = to || '9999-12-31'

  const inRange = (dateStr: string) => {
    if (!dateStr) return false
    return dateStr >= fromDate && dateStr <= toDate
  }

  const invoiceSortDate = (inv: Record<string, unknown>) =>
    String(inv.issue_date || String(inv.created_at || '').slice(0, 10) || '')

  const quoteSortDate = (q: Record<string, unknown>) =>
    String(q.issue_date || String(q.created_at || '').slice(0, 10) || '')

  const carryIn = openingBalanceCarryIn(
    client as Record<string, unknown>,
    (allPay || []) as Record<string, unknown>[],
  )
  const openingAmt = carryIn.originalAmount
  const openingDate = carryIn.asOfDate

  let opening = 0
  for (const inv of allInv || []) {
    if (!invoiceAffectsClientBalance(String(inv.status))) continue
    const d = inv.issue_date ? String(inv.issue_date) : ''
    if (d && d < fromDate) opening += Number(inv.total) || 0
  }
  for (const pay of allPay || []) {
    if (pay.is_adjustment) continue
    const d = pay.payment_date ? String(pay.payment_date) : ''
    if (d && d < fromDate) opening -= paymentTimelineCredit(pay as Record<string, unknown>)
  }

  if (openingAmt !== 0 && openingDate && openingDate < fromDate) {
    opening += openingAmt
  }
  opening = Math.round(opening * 100) / 100

  const lines: Record<string, unknown>[] = []
  if (openingAmt !== 0 && openingDate && inRange(openingDate)) {
    lines.push({
      id: null,
      sortDate: openingDate,
      type: 'opening_balance',
      label: 'Opening balance',
      inactive: false,
      affectsBalance: true,
      debit: openingAmt > 0 ? openingAmt : 0,
      credit: openingAmt < 0 ? Math.abs(openingAmt) : 0,
    })
  }
  for (const inv of allInv || []) {
    const sortDate = invoiceSortDate(inv)
    if (!sortDate || !inRange(sortDate)) continue
    const affectsBalance = invoiceAffectsClientBalance(String(inv.status))
    lines.push({
      id: inv.id,
      sortDate,
      type: 'invoice',
      label: inv.number || (inv.status === 'draft' ? 'Draft' : 'Invoice'),
      status: inv.status,
      inactive: !affectsBalance,
      affectsBalance,
      debit: Number(inv.total) || 0,
      credit: 0,
    })
  }
  for (const pay of allPay || []) {
    if (pay.is_adjustment) continue
    if (!inRange(String(pay.payment_date))) continue
    const credit = paymentTimelineCredit(pay as Record<string, unknown>)
    lines.push({
      id: pay.id,
      sortDate: pay.payment_date,
      type: 'payment',
      label: pay.reference || 'Payment',
      method: pay.method,
      inactive: false,
      affectsBalance: credit > 0.001,
      debit: 0,
      credit,
    })
  }
  for (const q of allQuotes || []) {
    const sortDate = quoteSortDate(q)
    if (!sortDate || !inRange(sortDate)) continue
    const awaitingInstall =
      q.status === 'draft' || q.status === 'sent' || q.status === 'accepted'
    lines.push({
      id: q.id,
      sortDate,
      type: 'quotation',
      label: q.number || (q.status === 'draft' ? 'Draft' : 'Quotation'),
      status: q.status,
      source: q.source || 'staff',
      inactive: true,
      affectsBalance: false,
      alwaysShow: awaitingInstall,
      debit: Number(q.total) || 0,
      credit: 0,
    })
  }
  lines.sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)))

  let balance = opening
  const withBalance = lines.map((line) => {
    if (line.affectsBalance) balance += Number(line.debit) - Number(line.credit)
    return { ...line, balance: Math.round(balance * 100) / 100 }
  })

  const balanceLines = withBalance.filter((l) => l.affectsBalance)
  const periodCharges = balanceLines.reduce((s, l) => s + Number(l.debit), 0)
  const periodCredits = balanceLines.reduce((s, l) => s + Number(l.credit), 0)

  return {
    client,
    from: from || null,
    to: to || null,
    openingBalance: opening,
    closingBalance: Math.round(balance * 100) / 100,
    periodCharges: Math.round(periodCharges * 100) / 100,
    periodCredits: Math.round(periodCredits * 100) / 100,
    carryIn,
    lines: withBalance,
  }
}

handlers.list_expense_categories = async ({ sb }, args) => {
  const { activeOnly = false, withUsage = false } = (args[0] || {}) as {
    activeOnly?: boolean
    withUsage?: boolean
  }
  let q = sb.from('expense_categories').select('*')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw mapDbError(error)

  let usedIds = new Set<string>()
  if (withUsage) {
    const { data: usedRows, error: usedErr } = await sb.from('expenses').select('category_id')
    if (usedErr) throw mapDbError(usedErr)
    usedIds = new Set(
      (usedRows || []).map((r) => r.category_id).filter(Boolean).map(String),
    )
  }

  const rows = (data || []).map((c) =>
    withUsage ? { ...c, in_use: usedIds.has(String(c.id)) } : c,
  )
  return sortExpenseCategories(rows as Record<string, unknown>[])
}

handlers.save_expense_category = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const { id, name, sort_order, active } = (args[0] || {}) as Record<string, unknown>
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new OpsError('Category name is required.')
  const row = {
    name: trimmed,
    sort_order: Number(sort_order) || 100,
    active: active !== false,
    updated_at: nowIso(),
  }
  if (id) {
    const { data, error } = await sb
      .from('expense_categories')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) throw mapDbError(error)
    return data
  }
  const { data, error } = await sb
    .from('expense_categories')
    .insert({ ...row, created_at: nowIso() })
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_expense_category = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  if (!id) throw new OpsError('Category id is required.')
  const { count, error: countErr } = await sb
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
  if (countErr) throw mapDbError(countErr)
  if ((count || 0) > 0) {
    throw new OpsError(
      'This category is used by existing expenses. Deactivate it instead of deleting.',
    )
  }
  const { error } = await sb.from('expense_categories').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return true
}

handlers.list_expenses = async ({ sb }, args) => {
  const { from, to, category_id } = (args[0] || {}) as {
    from?: string
    to?: string
    category_id?: string
  }
  let q = sb
    .from('expenses')
    .select('*, expense_categories(id, name)')
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (from) q = q.gte('expense_date', from)
  if (to) q = q.lte('expense_date', to)
  if (category_id) q = q.eq('category_id', category_id)
  const { data, error } = await q
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_expense = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const { data, error } = await sb
    .from('expenses')
    .select('*, expense_categories(id, name)')
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.save_expense = async ({ sb }, args) => {
  const {
    id,
    expense_date,
    amount,
    category_id,
    vendor,
    method,
    reference,
    notes,
  } = (args[0] || {}) as Record<string, unknown>
  if (!category_id) throw new OpsError('Please select a category.')
  const amt = Number(amount)
  if (!(amt > 0)) throw new OpsError('Enter an amount greater than zero.')
  if (!expense_date) throw new OpsError('Choose an expense date.')
  const row = {
    expense_date,
    amount: amt,
    category_id,
    vendor: vendor ? String(vendor).trim() : null,
    method: method || 'cash',
    reference: reference ? String(reference).trim() : null,
    notes: notes ? String(notes).trim() : null,
    updated_at: nowIso(),
  }
  if (id) {
    const { data, error } = await sb
      .from('expenses')
      .update(row)
      .eq('id', id)
      .select('*, expense_categories(id, name)')
      .single()
    if (error) throw mapDbError(error)
    return data
  }
  const { data, error } = await sb
    .from('expenses')
    .insert(row)
    .select('*, expense_categories(id, name)')
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_expense = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const { error } = await sb.from('expenses').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return true
}

function resolveProofClientId(user: UserRow, bodyClientId: unknown) {
  const sessionClient = portalClientId(user)
  if (sessionClient) {
    return enforcePortalClient(user, bodyClientId ? String(bodyClientId) : null)
  }
  return bodyClientId ? String(bodyClientId) : 'unknown'
}

handlers.upload_client_proof = async ({ user, sb }, args) => {
  const payload = (args[0] || {}) as {
    file?: { base64?: string; name?: string; type?: string }
    clientId?: string
  }
  const file = payload.file
  const clientId = resolveProofClientId(user, payload.clientId)

  if (!file?.base64) throw new OpsError('Choose a file to upload.')

  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
  if (bytes.length > PROOF_MAX_BYTES) {
    throw new OpsError(
      'That file is larger than 10 MB. Please upload a smaller image or PDF.',
    )
  }
  if (file.type && !PROOF_ALLOWED_TYPES.includes(file.type)) {
    throw new OpsError('Please upload an image (JPG, PNG, WebP, HEIC) or a PDF.')
  }

  const safeName = String(file.name || 'proof')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(-60)
  const path = `${clientId || 'unknown'}/${Date.now()}-${safeName}`

  const { error } = await sb.storage.from(PROOF_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (error) throw mapDbError(error)
  return { path }
}

handlers.get_proof_signed_url = async ({ sb }, args) => {
  const path = String(args[0] || '')
  const expiresIn = Number(args[1]) || 3600
  if (!path) throw new OpsError('No attachment on this record.')
  const { data, error } = await sb.storage.from(PROOF_BUCKET).createSignedUrl(path, expiresIn)
  if (error) throw mapDbError(error)
  return data?.signedUrl || null
}

handlers.list_payments_for_client = async ({ user, sb }, args) => {
  const clientId = enforcePortalClient(user, args[0] ? String(args[0]) : null)

  const { data: payments, error } = await sb
    .from('payments')
    .select('*')
    .eq('client_id', clientId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw mapDbError(error)

  const ids = (payments || []).map((p) => p.id)
  if (ids.length === 0) return []

  const { data: allocs, error: allocErr } = await sb
    .from('payment_allocations')
    .select('payment_id, amount')
    .in('payment_id', ids)
  if (allocErr) throw mapDbError(allocErr)

  const allocated: Record<string, number> = {}
  for (const a of allocs || []) {
    allocated[String(a.payment_id)] =
      (allocated[String(a.payment_id)] || 0) + (Number(a.amount) || 0)
  }

  return (payments || []).map((p) => {
    const used = Math.round((allocated[String(p.id)] || 0) * 100) / 100
    const unallocated = Math.round(((Number(p.amount) || 0) - used) * 100) / 100
    return { ...p, allocated_amount: used, unallocated_amount: unallocated }
  })
}

handlers.create_payment_notification = async ({ user, sb }, args) => {
  const {
    client_id,
    invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    proof_path,
  } = (args[0] || {}) as Record<string, unknown>
  const clientId = enforcePortalClient(user, client_id ? String(client_id) : null)

  const amt = Number(amount)
  if (!(amt > 0)) throw new OpsError('Enter an amount greater than zero.')
  if (!payment_date) throw new OpsError('Choose the date you paid.')
  const allowed = PAYMENT_METHODS.map((m) => m.value)
  const payMethod = allowed.includes(String(method)) ? String(method) : 'eft'

  const { data, error } = await sb
    .from('payment_notifications')
    .insert({
      client_id: clientId,
      invoice_id: invoice_id || null,
      amount: Math.round(amt * 100) / 100,
      payment_date,
      method: payMethod,
      reference: reference ? String(reference).trim() : null,
      note: note ? String(note).trim() : null,
      proof_path: proof_path || null,
    })
    .select('*, invoices(id, number)')
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.list_payment_notifications_for_client = async ({ user, sb }, args) => {
  const clientId = enforcePortalClient(user, args[0] ? String(args[0]) : null)
  const { data, error } = await sb
    .from('payment_notifications')
    .select('*, invoices(id, number)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) throw mapDbError(error)
  return data || []
}

handlers.list_payment_notifications = async ({ sb }, args) => {
  const { status = 'pending' } = (args[0] || {}) as { status?: string }
  let query = sb
    .from('payment_notifications')
    .select('*, clients(id, name), invoices(id, number)')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw mapDbError(error)
  return data || []
}

handlers.get_payment_notification = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const { data, error } = await sb
    .from('payment_notifications')
    .select('*, clients(id, name), invoices(id, number)')
    .eq('id', id)
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.resolve_payment_notification = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const { status, payment_id = null } = (args[1] || {}) as {
    status?: string
    payment_id?: string | null
  }
  if (!['accepted', 'dismissed', 'pending'].includes(String(status))) {
    throw new OpsError('Unknown notification outcome.')
  }
  const { data, error } = await sb
    .from('payment_notifications')
    .update({
      status,
      resolved_at: status === 'pending' ? null : nowIso(),
      resolved_payment_id: payment_id,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*, clients(id, name), invoices(id, number)')
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.get_invoice_dispute = async ({ sb }, args) => {
  const invoiceId = String(args[0] || '')
  const { data: threads, error } = await sb
    .from('invoice_disputes')
    .select('*, invoices(id, number), clients(id, name)')
    .eq('invoice_id', invoiceId)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw mapDbError(error)

  const dispute = (threads || [])[0] as Record<string, unknown> | undefined
  if (!dispute) return null

  const { data: messages, error: msgErr } = await sb
    .from('invoice_dispute_messages')
    .select('*')
    .eq('dispute_id', dispute.id)
    .order('created_at', { ascending: true })
  if (msgErr) throw mapDbError(msgErr)

  return { ...dispute, messages: messages || [] }
}

handlers.get_invoice_dispute_for_client = async ({ user, sb }, args) => {
  const invoiceId = String(args[0] || '')
  const clientId = enforcePortalClient(user, args[1] ? String(args[1]) : null)
  const res = await handlers.get_invoice_dispute({ sb, user }, [invoiceId])
  if (res && String((res as Record<string, unknown>).client_id) !== clientId) {
    throw new OpsError('Query not found.', 404)
  }
  return res
}

handlers.post_dispute_message = async ({ user, sb }, args) => {
  const {
    invoice_id,
    client_id,
    author_role,
    body,
    attachment_path,
  } = (args[0] || {}) as Record<string, unknown>
  if (!invoice_id) throw new OpsError('No invoice selected.')
  if (!client_id) throw new OpsError('No client selected.')
  const clientId = portalClientId(user)
    ? enforcePortalClient(user, String(client_id))
    : String(client_id)
  if (!String(body || '').trim()) throw new OpsError('Type a message before sending.')
  const role = author_role === 'staff' ? 'staff' : 'client'

  const { data: open, error: openErr } = await sb
    .from('invoice_disputes')
    .select('*')
    .eq('invoice_id', invoice_id)
    .eq('status', 'open')
    .maybeSingle()
  if (openErr) throw mapDbError(openErr)

  let disputeId = open?.id as string | undefined
  if (!disputeId) {
    const now = nowIso()
    const { data: created, error: createErr } = await sb
      .from('invoice_disputes')
      .insert({
        invoice_id,
        client_id: clientId,
        ...(role === 'staff' ? { staff_last_read_at: now } : { client_last_read_at: now }),
      })
      .select('id')
      .single()
    if (createErr) throw mapDbError(createErr)
    disputeId = String((created as Record<string, unknown>).id)
  }

  const { error: msgErr } = await sb.from('invoice_dispute_messages').insert({
    dispute_id: disputeId,
    author_role: role,
    body: String(body).trim(),
    attachment_path: attachment_path || null,
  })
  if (msgErr) throw mapDbError(msgErr)

  const now = nowIso()
  await sb
    .from('invoice_disputes')
    .update({
      updated_at: now,
      ...(role === 'staff' ? { staff_last_read_at: now } : { client_last_read_at: now }),
    })
    .eq('id', disputeId)

  return handlers.get_invoice_dispute({ sb, user }, [invoice_id])
}

handlers.list_open_disputes = async ({ sb }) => {
  const { data, error } = await sb
    .from('invoice_disputes')
    .select('*, invoices(id, number, total), clients(id, name)')
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
  if (error) throw mapDbError(error)
  return data || []
}

handlers.list_invoice_unread_counts = async ({ sb }, args) => {
  const { role = 'client', client_id } = (args[0] || {}) as {
    role?: string
    client_id?: string
  }
  const viewer = role === 'staff' ? 'staff' : 'client'
  let q = sb
    .from('invoice_disputes')
    .select(
      'id, invoice_id, client_id, client_last_read_at, staff_last_read_at, invoice_dispute_messages(id, author_role, created_at)',
    )
  if (client_id) q = q.eq('client_id', client_id)
  const { data, error } = await q
  if (error) throw mapDbError(error)

  const byInvoice: Record<string, number> = {}
  for (const row of data || []) {
    const unread = disputeUnreadCount(
      {
        ...(row as Record<string, unknown>),
        messages: (row as Record<string, unknown>).invoice_dispute_messages || [],
      },
      viewer,
    )
    if (unread < 1) continue
    const invoiceId = String((row as Record<string, unknown>).invoice_id)
    byInvoice[invoiceId] = (byInvoice[invoiceId] || 0) + unread
  }
  return byInvoice
}

handlers.set_dispute_status = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const status = String(args[1] || '')
  if (!['open', 'resolved'].includes(status)) {
    throw new OpsError('Unknown query status.')
  }
  const { data, error } = await sb
    .from('invoice_disputes')
    .update({
      status,
      resolved_at: status === 'resolved' ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.mark_dispute_read = async ({ sb }, args) => {
  const disputeId = String(args[0] || '')
  const role = String(args[1] || '')
  if (!disputeId) throw new OpsError('No query selected.')
  const col = role === 'staff' ? 'staff_last_read_at' : 'client_last_read_at'
  const now = nowIso()
  const { data, error } = await sb
    .from('invoice_disputes')
    .update({ [col]: now })
    .eq('id', disputeId)
    .select('id, client_last_read_at, staff_last_read_at')
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.decline_quotation = async ({ sb }, args) => {
  const id = String(args[0] || '')
  const reason = args[1]
  const trimmed = String(reason || '').trim()
  if (!trimmed) throw new OpsError('Give the client a short reason for declining.')
  const existing = await getQuotationInternal(sb, id)
  if (existing.status === 'converted') {
    throw new OpsError('This quotation was already converted to an invoice.')
  }

  const { data, error } = await sb
    .from('quotations')
    .update({
      status: 'declined',
      decline_reason: trimmed,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw mapDbError(error)
  return data
}

handlers.delete_quotation = async ({ user, sb }, args) => {
  assertAdminUser(user)
  const id = String(args[0] || '')
  const existing = await getQuotationInternal(sb, id)
  assertNotOwnClient(user, String(existing.client_id))

  if (String(existing.status) === 'converted') {
    throw new OpsError('Converted quotations cannot be deleted.')
  }

  const { error } = await sb.from('quotations').delete().eq('id', id)
  if (error) throw mapDbError(error)
  return { ok: true }
}

handlers.get_ops_dashboard_summary = async ({ sb }) => {
  const today = localTodayIso()
  const monthStart = `${today.slice(0, 7)}-01`

  const [notifRes, disputeRes, quoteRes, invoiceRes, paymentRes, clientsRes, deltaRes] =
    await Promise.all([
    sb
      .from('payment_notifications')
      .select('*, clients(id, name), invoices(id, number)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    sb
      .from('invoice_disputes')
      .select('*, invoices(id, number), clients(id, name)')
      .eq('status', 'open')
      .order('updated_at', { ascending: false }),
    sb
      .from('quotations')
      .select('id, number, total, issue_date, created_at, clients(id, name)')
      .eq('source', 'portal')
      .eq('status', 'draft')
      .order('created_at', { ascending: false }),
    sb
      .from('invoices')
      .select(
        'id, number, status, total, amount_paid, issue_date, due_date, client_id, clients(id, name)',
      )
      .in('status', [...BALANCE_INVOICE_STATUSES]),
    sb.from('payments').select('amount, payment_date').eq('is_adjustment', false).gte('payment_date', monthStart),
    sb.from('clients').select('id, opening_balance'),
    sb.from('payments').select('client_id, opening_balance_delta').neq('opening_balance_delta', 0),
  ])

  if (notifRes.error) throw mapDbError(notifRes.error)
  if (disputeRes.error) throw mapDbError(disputeRes.error)
  if (quoteRes.error) throw mapDbError(quoteRes.error)
  if (invoiceRes.error) throw mapDbError(invoiceRes.error)
  if (paymentRes.error) throw mapDbError(paymentRes.error)
  if (clientsRes.error) throw mapDbError(clientsRes.error)
  if (deltaRes.error) throw mapDbError(deltaRes.error)

  const invoices = (invoiceRes.data || []) as Record<string, unknown>[]
  const receivables = summarizeReceivables(invoices, today) as Record<string, number | string>
  const remainingById = openingBalanceRemainingMap(
    (clientsRes.data || []) as Record<string, unknown>[],
    (deltaRes.data || []) as Record<string, unknown>[],
  )
  const broughtForward =
    Math.round(
      (clientsRes.data || []).reduce((sum, c) => {
        const remaining = remainingById[String(c.id)] || 0
        return sum + (remaining > 0 ? remaining : 0)
      }, 0) * 100,
    ) / 100
  receivables.broughtForward = broughtForward
  receivables.total = Math.round((Number(receivables.total) + broughtForward) * 100) / 100

  const overdueInvoices = invoices
    .filter((inv) => {
      const balance = Math.round((Number(inv.total) - Number(inv.amount_paid || 0)) * 100) / 100
      if (balance <= 0.001) return false
      const due = invoiceEffectiveDueDate(inv)
      return Boolean(due && due < today)
    })
    .sort((a, b) =>
      invoiceEffectiveDueDate(a).localeCompare(invoiceEffectiveDueDate(b)),
    )

  const collectedThisMonth =
    Math.round(
      (paymentRes.data || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100,
    ) / 100

  return {
    today,
    paymentNotifications: notifRes.data || [],
    disputes: disputeRes.data || [],
    quoteRequests: quoteRes.data || [],
    overdueInvoices,
    receivables,
    collectedThisMonth,
  }
}
