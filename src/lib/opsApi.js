import { isSupabaseConfigured, supabase } from './supabase'
import { invokeFn } from './invokeFn'
import { AUTH_BYPASS, isAdmin, readSessionRole } from './authConfig'
import { buildClientDisplayName, formToClientRow } from './clientRegistration'
import { calcDocTotals, normalizeLines } from './billing'
import { prepareBillingDocumentBundle } from './billingDocument'
import { preparePaymentDocumentBundle } from './paymentDocument'
import {
  BALANCE_INVOICE_STATUSES,
  invoiceAffectsClientBalance,
  invoiceEffectiveDueDate,
  localTodayIso,
  PAYMENT_METHODS,
  summarizeReceivables,
} from './payments'
import { disputeUnreadCount } from './invoiceDisputes'

/** Private bucket holding client-uploaded proof of payment and query attachments. */
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

/** A–Z by name; "Other" always last. */
export function sortExpenseCategories(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aOther = String(a?.name || '').trim().toLowerCase() === 'other'
    const bOther = String(b?.name || '').trim().toLowerCase() === 'other'
    if (aOther !== bOther) return aOther ? 1 : -1
    return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
      sensitivity: 'base',
    })
  })
}

/**
 * Single entry point for ops data access.
 * Phase 0–5: direct Supabase under auth bypass + TEMP RLS.
 * Phase 6: prefer Edge Functions via invokeFn with JWT.
 */

function dbUnavailable() {
  return {
    data: null,
    error: { message: 'Supabase is not configured.' },
  }
}

function adminRequired() {
  return {
    data: null,
    error: { message: 'Admin access required for this action.' },
  }
}

/** Client-side gate for Settings / Stock / Tracking catalog mutations. */
function assertAdmin() {
  return isAdmin(readSessionRole())
}

function mapError(error) {
  const raw = String(error?.message || '').trim()
  const lower = raw.toLowerCase()

  let message = 'Something went wrong. Please try again.'

  const missingCol = raw.match(/could not find the '([^']+)' column/i)
  if (missingCol) {
    message = `A required database field is missing (${missingCol[1]}). Please ask an administrator to update the database, then try again.`
  } else if (lower.includes('schema cache') || lower.includes('could not find the')) {
    message =
      'The system is missing a recent database update. Please ask an administrator to apply the latest changes, then try again.'
  } else if (lower.includes('insufficient stock')) {
    message = raw.includes('Insufficient stock')
      ? raw.replace(/^.*Insufficient stock/i, 'Insufficient stock')
      : 'Not enough stock to issue this invoice.'
  } else if (lower.includes('duplicate') || lower.includes('unique')) {
    message = 'That record already exists. Check the details and try again.'
  } else if (lower.includes('network') || lower.includes('fetch')) {
    message = 'Could not reach the server. Check your internet connection and try again.'
  } else if (lower.includes('jwt') || lower.includes('not authenticated') || lower.includes('permission')) {
    message = 'You do not have permission to do that. Please sign in again.'
  } else if (lower.includes('violates') && lower.includes('check')) {
    message = 'One of the values entered is not allowed. Please review the form and try again.'
  } else if (raw.length < 120 && !lower.includes('pgrst') && !lower.includes('postgres')) {
    message = raw
  }

  if (raw && typeof console !== 'undefined') {
    console.warn('[opsApi]', raw)
  }

  return {
    data: null,
    error: { message, technical: raw || undefined },
  }
}

const directOpsApi = {
  async getStatus() {
    return {
      data: {
        authBypass: AUTH_BYPASS,
        supabaseConfigured: isSupabaseConfigured,
        phase: 'phase-6-edge',
      },
      error: null,
    }
  },

  async invoke(name, body) {
    return invokeFn(name, { body }, { withAuth: !AUTH_BYPASS })
  },

  // --- Clients ---

  async listClients() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name', { ascending: true })
    if (error) return mapError(error)
    return { data, error: null }
  },

  /**
   * Clients with statement-style closing balance.
   * Balance = sum(issued|partial|paid invoice totals) − sum(recorded payments).
   * Draft and void invoices are excluded.
   */
  async listClientsWithBalances() {
    if (!supabase) return dbUnavailable()
    const clientsRes = await this.listClients()
    if (clientsRes.error) return clientsRes

    const [invRes, payRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('client_id, total, status')
        .in('status', BALANCE_INVOICE_STATUSES),
      supabase.from('payments').select('client_id, amount'),
    ])
    if (invRes.error) return mapError(invRes.error)
    if (payRes.error) return mapError(payRes.error)

    const charges = {}
    for (const inv of invRes.data || []) {
      if (!invoiceAffectsClientBalance(inv.status)) continue
      const id = inv.client_id
      charges[id] = (charges[id] || 0) + (Number(inv.total) || 0)
    }
    const credits = {}
    for (const pay of payRes.data || []) {
      // Recorded payments always reduce the client balance.
      const id = pay.client_id
      credits[id] = (credits[id] || 0) + (Number(pay.amount) || 0)
    }

    const data = (clientsRes.data || []).map((c) => {
      const balance =
        Math.round(((charges[c.id] || 0) - (credits[c.id] || 0)) * 100) / 100
      return { ...c, balance }
    })
    return { data, error: null }
  },

  async getClient(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async createClient(form) {
    if (!supabase) return dbUnavailable()
    const displayName = buildClientDisplayName(form)
    if (!displayName) {
      return { data: null, error: { message: 'First name or surname is required.' } }
    }
    const { data, error } = await supabase
      .from('clients')
      .insert(formToClientRow(form))
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async updateClient(id, form) {
    if (!supabase) return dbUnavailable()
    const displayName = buildClientDisplayName(form)
    if (!displayName) {
      return { data: null, error: { message: 'First name or surname is required.' } }
    }
    const { data, error } = await supabase
      .from('clients')
      .update({ ...formToClientRow(form), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Products ---

  async listProducts({ activeOnly = false } = {}) {
    if (!supabase) return dbUnavailable()
    let q = supabase.from('products').select('*').order('sku', { ascending: true })
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) return mapError(error)
    return { data, error: null }
  },

  async updateProduct(id, payload) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const row = {
      name: payload.name?.trim(),
      unit_price: Number(payload.unit_price),
      active: Boolean(payload.active),
      updated_at: new Date().toISOString(),
    }
    if (!row.name) {
      return { data: null, error: { message: 'Product name is required.' } }
    }
    if (!(Number(row.unit_price) >= 0)) {
      return { data: null, error: { message: 'Unit price must be zero or greater.' } }
    }
    const { data, error } = await supabase
      .from('products')
      .update(row)
      .eq('id', id)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async deleteProduct(id) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!id) {
      return { data: null, error: { message: 'Product id is required.' } }
    }

    const checks = [
      { table: 'stock_movements', label: 'stock movements' },
      { table: 'purchase_order_lines', label: 'purchase orders' },
      { table: 'trackable_item_components', label: 'tracking catalog packages' },
      { table: 'quotation_lines', label: 'quotations' },
      { table: 'invoice_lines', label: 'invoices' },
    ]

    for (const check of checks) {
      const { count, error } = await supabase
        .from(check.table)
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id)
      if (error) {
        // Older DBs may not have every table; ignore missing-relation noise only if unexpected.
        const msg = String(error.message || '').toLowerCase()
        if (msg.includes('does not exist') || msg.includes('could not find')) continue
        return mapError(error)
      }
      if ((count || 0) > 0) {
        return {
          data: null,
          error: {
            message: `This product is used on ${check.label}. Deactivate it instead of deleting.`,
          },
        }
      }
    }

    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) return mapError(error)
    return { data: true, error: null }
  },

  async createProduct(payload) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const sku = String(payload.sku || '').trim()
    const name = String(payload.name || '').trim()
    if (!sku) {
      return { data: null, error: { message: 'SKU is required.' } }
    }
    if (!name) {
      return { data: null, error: { message: 'Product name is required.' } }
    }
    const row = {
      sku,
      name,
      unit_price: Math.max(0, Number(payload.unit_price) || 0),
      tracks_stock: Boolean(payload.tracks_stock),
      active: payload.active !== false,
    }
    const { data, error } = await supabase.from('products').insert(row).select().single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Trackable catalog (portal quote packages) ---

  async listTrackableItems({ activeOnly = false, withComponents = false } = {}) {
    if (!supabase) return dbUnavailable()
    const select = withComponents
      ? '*, trackable_item_components(id, product_id, quantity, sort_order, products(id, sku, name, unit_price, tracks_stock, active))'
      : '*'
    let q = supabase
      .from('trackable_items')
      .select(select)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) return mapError(error)

    if (withComponents) {
      const rows = (data || []).map((item) => {
        const components = [...(item.trackable_item_components || [])].sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
        )
        const { trackable_item_components: _drop, ...rest } = item
        return { ...rest, components }
      })
      return { data: rows, error: null }
    }
    return { data, error: null }
  },

  async saveTrackableItem({ id, name, blurb, active, sort_order }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const row = {
      name: String(name || '').trim(),
      blurb: String(blurb || '').trim() || null,
      active: active !== false,
      sort_order: Number(sort_order) || 0,
      updated_at: new Date().toISOString(),
    }
    if (!row.name) {
      return { data: null, error: { message: 'Name is required.' } }
    }
    if (id) {
      const { data, error } = await supabase
        .from('trackable_items')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) return mapError(error)
      return { data, error: null }
    }
    const { data, error } = await supabase
      .from('trackable_items')
      .insert(row)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async deleteTrackableItem(id) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const { error } = await supabase.from('trackable_items').delete().eq('id', id)
    if (error) return mapError(error)
    return { data: { id }, error: null }
  },

  async saveTrackableItemComponents(trackableItemId, components) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!trackableItemId) {
      return { data: null, error: { message: 'Trackable item is required.' } }
    }

    const cleaned = []
    const seen = new Set()
    for (const [i, c] of (components || []).entries()) {
      const product_id = c.product_id || null
      if (!product_id) continue
      if (seen.has(product_id)) {
        return {
          data: null,
          error: { message: 'Each product can only appear once in a package.' },
        }
      }
      seen.add(product_id)
      const quantity = Number(c.quantity)
      if (!(quantity > 0)) {
        return {
          data: null,
          error: { message: 'Component quantity must be greater than zero.' },
        }
      }
      cleaned.push({
        trackable_item_id: trackableItemId,
        product_id,
        quantity,
        sort_order: Number(c.sort_order) || (i + 1) * 10,
      })
    }

    const { error: delErr } = await supabase
      .from('trackable_item_components')
      .delete()
      .eq('trackable_item_id', trackableItemId)
    if (delErr) return mapError(delErr)

    if (cleaned.length) {
      const { error: insErr } = await supabase
        .from('trackable_item_components')
        .insert(cleaned)
      if (insErr) return mapError(insErr)
    }

    return this.listTrackableItems({ withComponents: true })
  },

  async _linesFromCatalogSelections(selections) {
    const picks = (selections || [])
      .map((s) => ({
        trackable_item_id: s.trackable_item_id,
        quantity: Number(s.quantity) || 0,
      }))
      .filter((s) => s.trackable_item_id && s.quantity > 0)

    if (!picks.length) {
      return {
        data: null,
        error: { message: 'Select at least one item to track and set a quantity.' },
      }
    }

    const catalogRes = await this.listTrackableItems({
      activeOnly: true,
      withComponents: true,
    })
    if (catalogRes.error) return catalogRes

    const byId = new Map((catalogRes.data || []).map((item) => [item.id, item]))
    const lines = []
    let sort = 1

    for (const pick of picks) {
      const item = byId.get(pick.trackable_item_id)
      if (!item) {
        return {
          data: null,
          error: { message: 'One of the selected items is no longer available.' },
        }
      }
      const components = item.components || []
      if (!components.length) {
        return {
          data: null,
          error: {
            message: `"${item.name}" is not configured yet. Please contact iTreq Inc.`,
          },
        }
      }
      for (const comp of components) {
        const product = Array.isArray(comp.products) ? comp.products[0] : comp.products
        if (!product || product.active === false) {
          return {
            data: null,
            error: {
              message: `"${item.name}" has an inactive product mapping. Please contact iTreq Inc.`,
            },
          }
        }
        const qty = Math.round(Number(comp.quantity) * pick.quantity * 100) / 100
        const isFee = product.tracks_stock === false
        const description = isFee
          ? `${item.name} — ${product.name}`
          : `${item.name} - Tracker Installation`
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

    return { data: lines, error: null }
  },

  async createPortalQuotationFromCatalog({ client_id, selections, notes }) {
    if (!supabase) return dbUnavailable()
    if (!client_id) {
      return { data: null, error: { message: 'No client selected.' } }
    }

    const built = await this._linesFromCatalogSelections(selections)
    if (built.error) return built

    return this.saveQuotation({
      client_id,
      notes,
      status: 'draft',
      source: 'portal',
      lines: built.data,
      discount_amount: 0,
    })
  },

  async updatePortalQuotationFromCatalog({ id, client_id, selections, notes }) {
    if (!supabase) return dbUnavailable()
    if (!id || !client_id) {
      return { data: null, error: { message: 'No quotation selected.' } }
    }

    const existing = await this.getQuotationForClient(id, client_id)
    if (existing.error) return existing
    if (existing.data.source !== 'portal' || existing.data.status !== 'draft') {
      return {
        data: null,
        error: { message: 'This quotation can no longer be edited.' },
      }
    }

    const built = await this._linesFromCatalogSelections(selections)
    if (built.error) return built

    return this.saveQuotation({
      id,
      client_id,
      notes,
      status: 'draft',
      source: 'portal',
      lines: built.data,
      discount_amount: existing.data.discount_amount || 0,
      issue_date: existing.data.issue_date,
    })
  },

  async deleteQuotationForClient(id, clientId) {
    if (!supabase) return dbUnavailable()
    if (!id || !clientId) {
      return { data: null, error: { message: 'No quotation selected.' } }
    }

    const existing = await this.getQuotationForClient(id, clientId)
    if (existing.error) return existing
    if (existing.data.source !== 'portal' || existing.data.status !== 'draft') {
      return {
        data: null,
        error: { message: 'This quotation can no longer be deleted.' },
      }
    }

    const { error } = await supabase.from('quotations').delete().eq('id', id)
    if (error) return mapError(error)
    return { data: true, error: null }
  },

  // --- Stock ---

  async getStockLevels() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('stock_levels')
      .select('*')
      .order('sku', { ascending: true })
    if (error) return mapError(error)
    return { data, error: null }
  },

  async adjustStock({ productId, quantityDelta, note }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const delta = Number(quantityDelta)
    if (!productId || !Number.isInteger(delta) || delta === 0) {
      return { data: null, error: { message: 'Enter a non-zero whole number quantity.' } }
    }

    if (delta < 0) {
      const { data: levels, error: levelErr } = await supabase
        .from('stock_levels')
        .select('on_hand')
        .eq('product_id', productId)
        .maybeSingle()
      if (levelErr) return mapError(levelErr)
      const onHand = levels?.on_hand ?? 0
      if (onHand + delta < 0) {
        return {
          data: null,
          error: { message: `Insufficient stock (on hand: ${onHand}).` },
        }
      }
    }

    const { data, error } = await supabase
      .from('stock_movements')
      .insert({
        product_id: productId,
        quantity_delta: delta,
        reason: 'adjustment',
        note: note?.trim() || null,
      })
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async listStockAdjustments() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, product_id, quantity_delta, note, created_at, products(sku, name)')
      .eq('reason', 'adjustment')
      .order('created_at', { ascending: false })
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  // --- Stock purchase orders (money out + receives) ---

  async listPurchaseOrders({ status } = {}) {
    if (!supabase) return dbUnavailable()
    let q = supabase
      .from('purchase_orders')
      .select('*, purchase_order_lines(id, product_id, quantity_ordered, quantity_received)')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  async getPurchaseOrder(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
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
    if (error) return mapError(error)
    if (Array.isArray(data.purchase_receipts)) {
      data.purchase_receipts.sort((a, b) =>
        String(b.received_date).localeCompare(String(a.received_date)),
      )
    }
    return { data, error: null }
  },

  async createPurchaseOrder({
    purchase_date,
    supplier,
    amount,
    method,
    reference,
    notes,
    lines,
  }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const amt = Number(amount)
    if (!(amt > 0)) {
      return { data: null, error: { message: 'Enter the amount paid (greater than zero).' } }
    }
    if (!purchase_date) {
      return { data: null, error: { message: 'Choose the date money left the account.' } }
    }
    const cleaned = (lines || [])
      .map((l) => ({
        product_id: l.product_id,
        quantity_ordered: Math.trunc(Number(l.quantity_ordered)),
        unit_cost:
          l.unit_cost === '' || l.unit_cost == null ? null : Number(l.unit_cost),
      }))
      .filter((l) => l.product_id && l.quantity_ordered > 0)

    if (cleaned.length === 0) {
      return {
        data: null,
        error: { message: 'Add at least one product with quantity ordered.' },
      }
    }

    const productIds = cleaned.map((l) => l.product_id)
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, sku, tracks_stock, active')
      .in('id', productIds)
    if (pErr) return mapError(pErr)
    const byId = Object.fromEntries((products || []).map((p) => [p.id, p]))
    for (const line of cleaned) {
      const p = byId[line.product_id]
      if (!p) {
        return { data: null, error: { message: 'One of the products was not found.' } }
      }
      if (!p.tracks_stock) {
        return {
          data: null,
          error: {
            message: `${p.sku} does not track stock — only stocked products can be on a purchase order.`,
          },
        }
      }
    }

    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        purchase_date,
        supplier: supplier?.trim() || null,
        amount: amt,
        method: method || 'eft',
        reference: reference?.trim() || null,
        notes: notes?.trim() || null,
        status: 'open',
      })
      .select()
      .single()
    if (poErr) return mapError(poErr)

    const lineRows = cleaned.map((l) => ({
      purchase_order_id: po.id,
      product_id: l.product_id,
      quantity_ordered: l.quantity_ordered,
      quantity_received: 0,
      unit_cost:
        l.unit_cost != null && Number.isFinite(l.unit_cost) && l.unit_cost >= 0
          ? l.unit_cost
          : null,
    }))

    const { error: lineErr } = await supabase.from('purchase_order_lines').insert(lineRows)
    if (lineErr) {
      await supabase.from('purchase_orders').delete().eq('id', po.id)
      return mapError(lineErr)
    }

    return this.getPurchaseOrder(po.id)
  },

  async receivePurchaseOrder({ purchase_order_id, received_date, notes, lines }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!purchase_order_id) {
      return { data: null, error: { message: 'Purchase order is required.' } }
    }
    if (!received_date) {
      return { data: null, error: { message: 'Choose the date stock was received.' } }
    }

    const { data: po, error: poErr } = await this.getPurchaseOrder(purchase_order_id)
    if (poErr) return { data: null, error: poErr }
    if (!po || po.status !== 'open') {
      return {
        data: null,
        error: { message: 'Only open purchase orders can receive stock.' },
      }
    }

    const poLines = po.purchase_order_lines || []
    const byLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))

    const cleaned = (lines || [])
      .map((l) => ({
        purchase_order_line_id: l.purchase_order_line_id,
        quantity: Math.trunc(Number(l.quantity)),
      }))
      .filter((l) => l.purchase_order_line_id && l.quantity > 0)

    if (cleaned.length === 0) {
      return {
        data: null,
        error: { message: 'Enter at least one quantity received.' },
      }
    }

    for (const row of cleaned) {
      const line = byLineId[row.purchase_order_line_id]
      if (!line) {
        return { data: null, error: { message: 'A receive line does not belong to this PO.' } }
      }
      const remaining = Number(line.quantity_ordered) - Number(line.quantity_received)
      if (row.quantity > remaining) {
        const sku = line.products?.sku || 'item'
        return {
          data: null,
          error: {
            message: `Cannot receive ${row.quantity} of ${sku} — only ${remaining} still outstanding.`,
          },
        }
      }
    }

    const { data: receipt, error: rErr } = await supabase
      .from('purchase_receipts')
      .insert({
        purchase_order_id,
        received_date,
        notes: notes?.trim() || null,
      })
      .select()
      .single()
    if (rErr) return mapError(rErr)

    const receiptLines = cleaned.map((row) => {
      const line = byLineId[row.purchase_order_line_id]
      return {
        purchase_receipt_id: receipt.id,
        purchase_order_line_id: row.purchase_order_line_id,
        product_id: line.product_id,
        quantity: row.quantity,
      }
    })

    const { error: rlErr } = await supabase
      .from('purchase_receipt_lines')
      .insert(receiptLines)
    if (rlErr) {
      await supabase.from('purchase_receipts').delete().eq('id', receipt.id)
      return mapError(rlErr)
    }

    for (const row of cleaned) {
      const line = byLineId[row.purchase_order_line_id]
      const nextReceived = Number(line.quantity_received) + row.quantity
      const { error: uErr } = await supabase
        .from('purchase_order_lines')
        .update({ quantity_received: nextReceived })
        .eq('id', line.id)
      if (uErr) return mapError(uErr)

      const { error: mErr } = await supabase.from('stock_movements').insert({
        product_id: line.product_id,
        quantity_delta: row.quantity,
        reason: 'purchase_receive',
        note: `PO ${po.po_number}`,
        reference_type: 'purchase_receipt',
        reference_id: receipt.id,
      })
      if (mErr) return mapError(mErr)

      line.quantity_received = nextReceived
    }

    const fullyReceived = poLines.every(
      (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
    )
    if (fullyReceived) {
      const { error: sErr } = await supabase
        .from('purchase_orders')
        .update({ status: 'closed', updated_at: new Date().toISOString() })
        .eq('id', purchase_order_id)
      if (sErr) return mapError(sErr)
    } else {
      await supabase
        .from('purchase_orders')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', purchase_order_id)
    }

    return this.getPurchaseOrder(purchase_order_id)
  },

  async updatePurchaseReceipt({ id, received_date, notes, lines }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!id) {
      return { data: null, error: { message: 'Delivery is required.' } }
    }
    if (!received_date) {
      return { data: null, error: { message: 'Choose the date stock was received.' } }
    }

    const { data: receipt, error: rErr } = await supabase
      .from('purchase_receipts')
      .select(
        `*,
        purchase_receipt_lines(id, purchase_order_line_id, product_id, quantity),
        purchase_orders(id, po_number, status)`,
      )
      .eq('id', id)
      .single()
    if (rErr) return mapError(rErr)

    const poId = receipt.purchase_order_id
    const { data: po, error: poErr } = await this.getPurchaseOrder(poId)
    if (poErr) return { data: null, error: poErr }

    const poLines = po.purchase_order_lines || []
    const byPoLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))
    const oldLines = receipt.purchase_receipt_lines || []
    const byReceiptLineId = Object.fromEntries(oldLines.map((l) => [l.id, l]))

    const cleaned = (lines || [])
      .map((l) => ({
        id: l.id,
        purchase_order_line_id: l.purchase_order_line_id,
        quantity: Math.trunc(Number(l.quantity)),
      }))
      .filter((l) => l.id && byReceiptLineId[l.id])

    if (cleaned.length !== oldLines.length) {
      return {
        data: null,
        error: { message: 'Delivery lines are incomplete. Refresh and try again.' },
      }
    }

    if (cleaned.every((l) => l.quantity <= 0)) {
      return this.cancelPurchaseReceipt(id)
    }

    for (const row of cleaned) {
      if (row.quantity < 0) {
        return { data: null, error: { message: 'Quantities cannot be negative.' } }
      }
      const old = byReceiptLineId[row.id]
      const poLine = byPoLineId[old.purchase_order_line_id]
      if (!poLine) {
        return { data: null, error: { message: 'A delivery line no longer matches this PO.' } }
      }
      const oldQty = Number(old.quantity)
      const newQty = row.quantity
      const delta = newQty - oldQty
      if (delta === 0) continue

      if (delta > 0) {
        const remainingExcludingThis =
          Number(poLine.quantity_ordered) -
          (Number(poLine.quantity_received) - oldQty)
        if (newQty > remainingExcludingThis) {
          const sku = poLine.products?.sku || 'item'
          return {
            data: null,
            error: {
              message: `Cannot set ${newQty} of ${sku} — only ${remainingExcludingThis} can be on this delivery.`,
            },
          }
        }
      } else {
        const { data: levels, error: levelErr } = await supabase
          .from('stock_levels')
          .select('on_hand, sku')
          .eq('product_id', old.product_id)
          .maybeSingle()
        if (levelErr) return mapError(levelErr)
        const onHand = levels?.on_hand ?? 0
        if (onHand + delta < 0) {
          const sku = levels?.sku || poLine.products?.sku || 'item'
          return {
            data: null,
            error: {
              message: `Cannot reduce ${sku} by ${-delta} — only ${onHand} on hand.`,
            },
          }
        }
      }
    }

    const { error: updErr } = await supabase
      .from('purchase_receipts')
      .update({
        received_date,
        notes: notes?.trim() || null,
      })
      .eq('id', id)
    if (updErr) return mapError(updErr)

    for (const row of cleaned) {
      const old = byReceiptLineId[row.id]
      const poLine = byPoLineId[old.purchase_order_line_id]
      const oldQty = Number(old.quantity)
      const newQty = row.quantity
      const delta = newQty - oldQty

      if (newQty === 0) {
        const { error: delErr } = await supabase
          .from('purchase_receipt_lines')
          .delete()
          .eq('id', row.id)
        if (delErr) return mapError(delErr)
      } else if (delta !== 0) {
        const { error: lineUpdErr } = await supabase
          .from('purchase_receipt_lines')
          .update({ quantity: newQty })
          .eq('id', row.id)
        if (lineUpdErr) return mapError(lineUpdErr)
      }

      if (delta !== 0) {
        const nextReceived = Number(poLine.quantity_received) + delta
        const { error: poLineErr } = await supabase
          .from('purchase_order_lines')
          .update({ quantity_received: nextReceived })
          .eq('id', poLine.id)
        if (poLineErr) return mapError(poLineErr)
        poLine.quantity_received = nextReceived

        const { error: mErr } = await supabase.from('stock_movements').insert({
          product_id: old.product_id,
          quantity_delta: delta,
          reason: delta > 0 ? 'purchase_receive' : 'purchase_receive_adjust',
          note: `PO ${po.po_number} (edit delivery)`,
          reference_type: 'purchase_receipt',
          reference_id: id,
        })
        if (mErr) return mapError(mErr)
      }
    }

    const fullyReceived = poLines.every(
      (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
    )
    const nextStatus = fullyReceived ? 'closed' : 'open'
    if (po.status !== nextStatus) {
      const { error: sErr } = await supabase
        .from('purchase_orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', poId)
      if (sErr) return mapError(sErr)
    } else {
      await supabase
        .from('purchase_orders')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', poId)
    }

    return this.getPurchaseOrder(poId)
  },

  async cancelPurchaseReceipt(id) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!id) {
      return { data: null, error: { message: 'Delivery is required.' } }
    }

    const { data: receipt, error: rErr } = await supabase
      .from('purchase_receipts')
      .select(
        `*,
        purchase_receipt_lines(id, purchase_order_line_id, product_id, quantity)`,
      )
      .eq('id', id)
      .single()
    if (rErr) return mapError(rErr)

    const poId = receipt.purchase_order_id
    const { data: po, error: poErr } = await this.getPurchaseOrder(poId)
    if (poErr) return { data: null, error: poErr }

    const poLines = po.purchase_order_lines || []
    const byPoLineId = Object.fromEntries(poLines.map((l) => [l.id, l]))
    const receiptLines = receipt.purchase_receipt_lines || []

    for (const row of receiptLines) {
      const qty = Number(row.quantity)
      if (!(qty > 0)) continue
      const { data: levels, error: levelErr } = await supabase
        .from('stock_levels')
        .select('on_hand, sku')
        .eq('product_id', row.product_id)
        .maybeSingle()
      if (levelErr) return mapError(levelErr)
      const onHand = levels?.on_hand ?? 0
      if (onHand < qty) {
        const sku =
          levels?.sku || byPoLineId[row.purchase_order_line_id]?.products?.sku || 'item'
        return {
          data: null,
          error: {
            message: `Cannot cancel this delivery — ${sku} only has ${onHand} on hand (need to reverse ${qty}).`,
          },
        }
      }
    }

    for (const row of receiptLines) {
      const qty = Number(row.quantity)
      const poLine = byPoLineId[row.purchase_order_line_id]
      if (!poLine) {
        return { data: null, error: { message: 'A delivery line no longer matches this PO.' } }
      }

      const nextReceived = Math.max(0, Number(poLine.quantity_received) - qty)
      const { error: uErr } = await supabase
        .from('purchase_order_lines')
        .update({ quantity_received: nextReceived })
        .eq('id', poLine.id)
      if (uErr) return mapError(uErr)
      poLine.quantity_received = nextReceived

      if (qty > 0) {
        const { error: mErr } = await supabase.from('stock_movements').insert({
          product_id: row.product_id,
          quantity_delta: -qty,
          reason: 'purchase_receive_cancel',
          note: `PO ${po.po_number} (cancel delivery)`,
          reference_type: 'purchase_receipt',
          reference_id: id,
        })
        if (mErr) return mapError(mErr)
      }
    }

    const { error: delErr } = await supabase.from('purchase_receipts').delete().eq('id', id)
    if (delErr) return mapError(delErr)

    const fullyReceived = poLines.every(
      (l) => Number(l.quantity_received) >= Number(l.quantity_ordered),
    )
    const { error: sErr } = await supabase
      .from('purchase_orders')
      .update({
        status: fullyReceived ? 'closed' : 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', poId)
    if (sErr) return mapError(sErr)

    return this.getPurchaseOrder(poId)
  },

  // --- Settings ---

  async getSettings() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async updateSettings(payload) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const row = {
      company_name: payload.company_name?.trim() || 'iTreq Inc',
      currency: payload.currency?.trim() || 'BWP',
      quote_prefix: payload.quote_prefix?.trim() || 'Q',
      invoice_prefix: payload.invoice_prefix?.trim() || 'INV',
      next_quote_number: Math.max(1, Number(payload.next_quote_number) || 1),
      next_invoice_number: Math.max(1, Number(payload.next_invoice_number) || 1),
      default_tax_rate: Math.max(0, Number(payload.default_tax_rate) || 0),
      letterhead_address: payload.letterhead_address?.trim() || null,
      letterhead_phone: payload.letterhead_phone?.trim() || null,
      letterhead_email: payload.letterhead_email?.trim() || null,
      banking_details: payload.banking_details?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('company_settings')
      .update(row)
      .eq('id', 1)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Quotations ---

  async listQuotations({ client_id } = {}) {
    if (!supabase) return dbUnavailable()
    let query = supabase
      .from('quotations')
      .select('*, clients(name)')
      .order('created_at', { ascending: false })
    if (client_id) query = query.eq('client_id', client_id)
    const { data, error } = await query
    if (error) return mapError(error)
    return { data, error: null }
  },

  async getQuotation(id) {
    if (!supabase) return dbUnavailable()
    const { data: quotation, error } = await supabase
      .from('quotations')
      .select('*, clients(name)')
      .eq('id', id)
      .single()
    if (error) return mapError(error)
    const { data: lines, error: lineErr } = await supabase
      .from('quotation_lines')
      .select('*')
      .eq('quotation_id', id)
      .order('sort_order', { ascending: true })
    if (lineErr) return mapError(lineErr)
    return { data: { ...quotation, lines: lines || [] }, error: null }
  },

  async getQuotationForClient(id, clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'No client selected.' } }
    }
    const res = await this.getQuotation(id)
    if (res.error) return res
    if (res.data.client_id !== clientId) {
      return { data: null, error: { message: 'Quotation not found.' } }
    }
    return res
  },

  async saveQuotation({
    id,
    client_id,
    issue_date,
    notes,
    status,
    lines,
    discount_amount,
    source,
  }) {
    if (!supabase) return dbUnavailable()
    const settingsRes = await this.getSettings()
    const taxRate = settingsRes.data?.default_tax_rate ?? 0
    const normalized = normalizeLines(lines)
    if (!client_id) {
      return { data: null, error: { message: 'Please select a client.' } }
    }
    if (!normalized.length) {
      return { data: null, error: { message: 'Add at least one line item.' } }
    }
    const totals = calcDocTotals(normalized, taxRate, discount_amount)
    const docSource = source === 'portal' ? 'portal' : 'staff'

    let quoteId = id || null
    let number = null

    if (quoteId) {
      const existing = await this.getQuotation(quoteId)
      if (existing.error) return existing
      if (['converted', 'cancelled'].includes(existing.data.status)) {
        return { data: null, error: { message: 'This quotation can no longer be edited.' } }
      }
      number = existing.data.number
      const { error } = await supabase
        .from('quotations')
        .update({
          client_id,
          issue_date: issue_date || existing.data.issue_date,
          notes: notes?.trim() || null,
          status: status || existing.data.status,
          ...totals,
          updated_at: new Date().toISOString(),
        })
        .eq('id', quoteId)
      if (error) return mapError(error)
      await supabase.from('quotation_lines').delete().eq('quotation_id', quoteId)
    } else {
      const { data: allocated, error: allocErr } = await supabase.rpc(
        'allocate_document_number',
        { doc_type: 'quote' },
      )
      if (allocErr) return mapError(allocErr)
      number = allocated
      const { data, error } = await supabase
        .from('quotations')
        .insert({
          client_id,
          number,
          issue_date: issue_date || new Date().toISOString().slice(0, 10),
          notes: notes?.trim() || null,
          status: status || 'draft',
          source: docSource,
          ...totals,
        })
        .select()
        .single()
      if (error) return mapError(error)
      quoteId = data.id
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
    const { error: linesErr } = await supabase.from('quotation_lines').insert(lineRows)
    if (linesErr) return mapError(linesErr)

    return this.getQuotation(quoteId)
  },

  async setQuotationStatus(id, status) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('quotations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  /** After a successful email: draft/accepted → sent. Leaves converted/cancelled alone. */
  async markQuotationSent(id) {
    if (!supabase) return dbUnavailable()
    const existing = await this.getQuotation(id)
    if (existing.error) return existing
    const status = existing.data.status
    if (status === 'converted' || status === 'cancelled' || status === 'sent') {
      return { data: existing.data, error: null }
    }
    return this.setQuotationStatus(id, 'sent')
  },

  async convertQuotationToInvoice(quotationId) {
    if (!supabase) return dbUnavailable()
    const quoteRes = await this.getQuotation(quotationId)
    if (quoteRes.error) return quoteRes
    const quote = quoteRes.data
    if (quote.status === 'converted') {
      return { data: null, error: { message: 'This quotation was already converted.' } }
    }
    if (quote.status === 'cancelled') {
      return { data: null, error: { message: 'Cannot convert a cancelled quotation.' } }
    }

    const invRes = await this.saveInvoice({
      client_id: quote.client_id,
      quotation_id: quote.id,
      notes: quote.notes,
      discount_amount: quote.discount_amount,
      lines: quote.lines,
      status: 'draft',
    })
    if (invRes.error) return invRes

    const { error } = await supabase
      .from('quotations')
      .update({
        status: 'converted',
        converted_invoice_id: invRes.data.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
    if (error) return mapError(error)

    return invRes
  },

  // --- Invoices ---

  async listInvoices({ client_id, forPortal = false } = {}) {
    if (!supabase) return dbUnavailable()
    let query = supabase
      .from('invoices')
      .select('*, clients(name)')
      .order('created_at', { ascending: false })
    if (client_id) query = query.eq('client_id', client_id)
    if (forPortal) query = query.in('status', BALANCE_INVOICE_STATUSES)
    const { data, error } = await query
    if (error) return mapError(error)
    return { data, error: null }
  },

  async getInvoice(id) {
    if (!supabase) return dbUnavailable()
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('id', id)
      .single()
    if (error) return mapError(error)
    const { data: lines, error: lineErr } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true })
    if (lineErr) return mapError(lineErr)
    return { data: { ...invoice, lines: lines || [] }, error: null }
  },

  /** Portal-safe invoice fetch: must belong to client and be a balance status. */
  async getInvoiceForClient(id, clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'No client selected.' } }
    }
    const res = await this.getInvoice(id)
    if (res.error) return res
    if (res.data.client_id !== clientId || !invoiceAffectsClientBalance(res.data.status)) {
      return { data: null, error: { message: 'Invoice not found.' } }
    }
    return res
  },

  async saveInvoice({
    id,
    client_id,
    quotation_id,
    issue_date,
    due_date,
    notes,
    status,
    lines,
    discount_amount,
  }) {
    if (!supabase) return dbUnavailable()
    const settingsRes = await this.getSettings()
    const taxRate = settingsRes.data?.default_tax_rate ?? 0
    const normalized = normalizeLines(lines)
    if (!client_id) {
      return { data: null, error: { message: 'Please select a client.' } }
    }
    if (!normalized.length) {
      return { data: null, error: { message: 'Add at least one line item.' } }
    }
    const totals = calcDocTotals(normalized, taxRate, discount_amount)

    let invoiceId = id || null

    if (invoiceId) {
      const existing = await this.getInvoice(invoiceId)
      if (existing.error) return existing
      if (existing.data.status !== 'draft') {
        return { data: null, error: { message: 'Only draft invoices can be edited.' } }
      }
      const { error } = await supabase
        .from('invoices')
        .update({
          client_id,
          quotation_id: quotation_id || existing.data.quotation_id,
          issue_date: issue_date || null,
          due_date: due_date || null,
          notes: notes?.trim() || null,
          status: 'draft',
          ...totals,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
      if (error) return mapError(error)
      await supabase.from('invoice_lines').delete().eq('invoice_id', invoiceId)
    } else {
      const { data, error } = await supabase
        .from('invoices')
        .insert({
          client_id,
          quotation_id: quotation_id || null,
          issue_date: issue_date || null,
          due_date: due_date || null,
          notes: notes?.trim() || null,
          status: status || 'draft',
          ...totals,
        })
        .select()
        .single()
      if (error) return mapError(error)
      invoiceId = data.id
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
    const { error: linesErr } = await supabase.from('invoice_lines').insert(lineRows)
    if (linesErr) return mapError(linesErr)

    return this.getInvoice(invoiceId)
  },

  async issueInvoice(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase.rpc('issue_invoice', { p_invoice_id: id })
    if (error) return mapError(error)
    return this.getInvoice(id)
  },

  async voidInvoice(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase.rpc('void_invoice', { p_invoice_id: id })
    if (error) return mapError(error)
    return this.getInvoice(id)
  },

  // --- Monthly fees (Phase 4) ---

  /** @param {{ billing_period: string }} — ISO date (any day in the target month) */
  async previewMonthlyFeeRun({ billing_period }) {
    if (!supabase) return dbUnavailable()
    if (!billing_period) {
      return { data: null, error: { message: 'Choose a billing month.' } }
    }
    const { data, error } = await supabase.rpc('preview_monthly_fee_invoices', {
      p_billing_period: billing_period,
    })
    if (error) return mapError(error)
    return { data, error: null }
  },

  async generateMonthlyFeeInvoices({ billing_period }) {
    if (!supabase) return dbUnavailable()
    if (!billing_period) {
      return { data: null, error: { message: 'Choose a billing month.' } }
    }
    const { data, error } = await supabase.rpc('generate_monthly_fee_invoices', {
      p_billing_period: billing_period,
    })
    if (error) return mapError(error)
    return { data, error: null }
  },

  /**
   * Print/email bundle. Staff and portal both render from this same model
   * (letterhead, lines, banking, quote terms). Portal callers should use
   * getBillingDocumentBundleForClient so ownership is checked first.
   */
  async getBillingDocumentBundle(documentType, id) {
    const type = documentType === 'invoice' ? 'invoice' : 'quote'
    const settingsRes = await this.getSettings()
    if (settingsRes.error) return settingsRes

    const docRes =
      type === 'quote' ? await this.getQuotation(id) : await this.getInvoice(id)
    if (docRes.error) return docRes

    const clientRes = await this.getClient(docRes.data.client_id)
    if (clientRes.error) return clientRes

    let paidDate = null
    if (type === 'invoice' && docRes.data.status === 'paid') {
      const { data: allocs, error: allocErr } = await supabase
        .from('payment_allocations')
        .select('amount, payments(payment_date)')
        .eq('invoice_id', id)
      if (allocErr) return mapError(allocErr)
      for (const row of allocs || []) {
        const pay = row.payments
        const d = Array.isArray(pay) ? pay[0]?.payment_date : pay?.payment_date
        if (d && (!paidDate || d > paidDate)) paidDate = d
      }
    }

    const productsRes = await this.listProducts()
    if (productsRes.error) return productsRes
    const productsById = Object.fromEntries(
      (productsRes.data || []).map((p) => [p.id, p]),
    )

    const bundle = prepareBillingDocumentBundle({
      type,
      doc: { ...docRes.data, paid_date: paidDate },
      client: clientRes.data,
      settings: settingsRes.data,
      productsById,
    })
    return { data: bundle, error: null }
  },

  /** Portal-safe print bundle: document must belong to the given client. */
  async getBillingDocumentBundleForClient(documentType, id, clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'No client selected.' } }
    }
    const type = documentType === 'invoice' ? 'invoice' : 'quote'
    if (type === 'invoice') {
      const invRes = await this.getInvoiceForClient(id, clientId)
      if (invRes.error) return invRes
    } else {
      const quoteRes = await this.getQuotationForClient(id, clientId)
      if (quoteRes.error) return quoteRes
    }
    return this.getBillingDocumentBundle(type, id)
  },

  async sendBillingDocumentEmail(documentType, id) {
    const bundleRes = await this.getBillingDocumentBundle(documentType, id)
    if (bundleRes.error) return bundleRes

    const { model, emailHtml, plainText } = bundleRes.data
    const to = model.client.email?.trim()
    if (!to) {
      return { data: null, error: { message: 'This client has no email address on file.' } }
    }

    return this.invoke('send-billing-document', {
      to,
      subject: `${model.title} ${model.docNumber} — ${model.company.name}`,
      html: emailHtml,
      text: plainText,
    })
  },

  // --- Payments (Phase 3) ---

  async listPayments() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('payments')
      .select('*, clients(name)')
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return mapError(error)
    return { data, error: null }
  },

  async listOpenInvoicesForClient(clientId, { editingPaymentId = null } = {}) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['issued', 'partial', 'paid'])
      .order('issue_date', { ascending: true })
    if (error) return mapError(error)

    let currentAlloc = {}
    if (editingPaymentId) {
      const { data: allocs, error: allocErr } = await supabase
        .from('payment_allocations')
        .select('invoice_id, amount')
        .eq('payment_id', editingPaymentId)
      if (allocErr) return mapError(allocErr)
      for (const a of allocs || []) {
        currentAlloc[a.invoice_id] = Number(a.amount) || 0
      }
    }

    const open = (data || [])
      .map((inv) => {
        const paid = Number(inv.amount_paid) || 0
        const thisAlloc = currentAlloc[inv.id] || 0
        const due = Math.round((Number(inv.total) - paid + thisAlloc) * 100) / 100
        return { ...inv, _allocatable: due, _current_alloc: thisAlloc }
      })
      .filter((inv) => inv._allocatable > 0.001)
    return { data: open, error: null }
  },

  async getPayment(id) {
    if (!supabase) return dbUnavailable()
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*, clients(name)')
      .eq('id', id)
      .single()
    if (error) return mapError(error)
    const { data: allocations, error: allocErr } = await supabase
      .from('payment_allocations')
      .select('*, invoices(id, number, total, amount_paid, status)')
      .eq('payment_id', id)
    if (allocErr) return mapError(allocErr)
    return { data: { ...payment, allocations: allocations || [] }, error: null }
  },

  /** Portal-safe payment fetch: must belong to the given client. */
  async getPaymentForClient(id, clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'No client selected.' } }
    }
    const res = await this.getPayment(id)
    if (res.error) return res
    if (res.data.client_id !== clientId) {
      return { data: null, error: { message: 'Payment not found.' } }
    }
    return res
  },

  async getPaymentDocumentBundle(id) {
    const payRes = await this.getPayment(id)
    if (payRes.error) return payRes
    const settingsRes = await this.getSettings()
    if (settingsRes.error) return settingsRes
    const clientRes = await this.getClient(payRes.data.client_id)
    if (clientRes.error) return clientRes

    return {
      data: preparePaymentDocumentBundle({
        payment: payRes.data,
        client: clientRes.data,
        settings: settingsRes.data,
      }),
      error: null,
    }
  },

  async getPaymentDocumentBundleForClient(id, clientId) {
    const guarded = await this.getPaymentForClient(id, clientId)
    if (guarded.error) return guarded
    return this.getPaymentDocumentBundle(id)
  },

  async sendPaymentDocumentEmail(id) {
    const bundleRes = await this.getPaymentDocumentBundle(id)
    if (bundleRes.error) return bundleRes

    const { model, emailHtml, plainText } = bundleRes.data
    const to = model.client.email?.trim()
    if (!to) {
      return { data: null, error: { message: 'This client has no email address on file.' } }
    }

    return this.invoke('send-billing-document', {
      to,
      subject: `${model.title} ${model.docNumber} — ${model.company.name}`,
      html: emailHtml,
      text: plainText,
    })
  },

  async recordPayment({
    client_id,
    amount,
    payment_date,
    method,
    reference,
    notes,
    allocations,
  }) {
    if (!supabase) return dbUnavailable()
    if (!client_id) {
      return { data: null, error: { message: 'Please select a client.' } }
    }
    const payload = (allocations || [])
      .filter((a) => Number(a.amount) > 0)
      .map((a) => ({
        invoice_id: a.invoice_id,
        amount: Number(a.amount),
      }))
    const { data, error } = await supabase.rpc('record_payment', {
      p_client_id: client_id,
      p_amount: Number(amount),
      p_payment_date: payment_date || null,
      p_method: method || 'cash',
      p_reference: reference || null,
      p_notes: notes || null,
      p_allocations: payload,
    })
    if (error) return mapError(error)
    return { data: { id: data }, error: null }
  },

  async updatePayment({
    id,
    amount,
    payment_date,
    method,
    reference,
    notes,
    allocations,
  }) {
    if (!supabase) return dbUnavailable()
    if (!id) {
      return { data: null, error: { message: 'Payment id is required.' } }
    }
    const payload = (allocations || [])
      .filter((a) => Number(a.amount) > 0)
      .map((a) => ({
        invoice_id: a.invoice_id,
        amount: Number(a.amount),
      }))
    const { data, error } = await supabase.rpc('update_payment', {
      p_payment_id: id,
      p_amount: Number(amount),
      p_payment_date: payment_date || null,
      p_method: method || 'cash',
      p_reference: reference || null,
      p_notes: notes || null,
      p_allocations: payload,
    })
    if (error) return mapError(error)
    return { data: { id: data }, error: null }
  },

  async deletePayment(id) {
    if (!supabase) return dbUnavailable()
    const { error } = await supabase.rpc('delete_payment', { p_payment_id: id })
    if (error) return mapError(error)
    return { data: { ok: true }, error: null }
  },

  async getClientCreditBalance(clientId) {
    if (!supabase) return dbUnavailable()
    if (!clientId) {
      return { data: { balance: 0 }, error: null }
    }
    const { data, error } = await supabase.rpc('get_client_credit_balance', {
      p_client_id: clientId,
    })
    if (error) return mapError(error)
    return { data: { balance: Number(data) || 0 }, error: null }
  },

  async applyClientCreditToInvoice(invoiceId, amount = null) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase.rpc('apply_client_credit_to_invoice', {
      p_invoice_id: invoiceId,
      p_amount: amount != null ? Number(amount) : null,
    })
    if (error) return mapError(error)
    return { data: { applied: Number(data) || 0 }, error: null }
  },

  async getIncomeReport({ from, to }) {
    if (!supabase) return dbUnavailable()
    let q = supabase
      .from('payments')
      .select('id, amount, method, payment_date, reference, notes, clients(name)')
      .order('payment_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (from) q = q.gte('payment_date', from)
    if (to) q = q.lte('payment_date', to)
    const { data, error } = await q
    if (error) return mapError(error)
    const rows = data || []
    const byMethod = {}
    let total = 0
    for (const row of rows) {
      const amt = Number(row.amount) || 0
      total += amt
      const key = row.method || 'other'
      byMethod[key] = (byMethod[key] || 0) + amt
    }

    const seen = new Set()
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
      data: {
        from: from || null,
        to: to || null,
        total: Math.round(total * 100) / 100,
        paymentCount: rows.length,
        methodTotals,
        byMethod: methodTotals.filter((row) => row.amount > 0),
        payments: rows.map((row) => {
          const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
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
      },
      error: null,
    }
  },

  async getExpensesReport({ from, to }) {
    if (!supabase) return dbUnavailable()
    let q = supabase
      .from('expenses')
      .select(
        'id, expense_date, amount, vendor, method, reference, notes, category_id, expense_categories(id, name)',
      )
      .order('expense_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)

    const [expRes, catRes] = await Promise.all([
      q,
      this.listExpenseCategories({ activeOnly: false }),
    ])
    if (expRes.error) return mapError(expRes.error)
    if (catRes.error) return catRes

    const rows = expRes.data || []
    const byMethod = {}
    const byCategoryId = {}
    const byCategoryName = {}
    let total = 0
    for (const row of rows) {
      const amt = Number(row.amount) || 0
      total += amt
      const methodKey = row.method || 'other'
      byMethod[methodKey] = (byMethod[methodKey] || 0) + amt
      const cat = Array.isArray(row.expense_categories)
        ? row.expense_categories[0]
        : row.expense_categories
      const catId = row.category_id || cat?.id
      const catName = cat?.name || 'Uncategorised'
      if (catId) byCategoryId[catId] = (byCategoryId[catId] || 0) + amt
      byCategoryName[catName] = (byCategoryName[catName] || 0) + amt
    }

    const catalog = sortExpenseCategories(catRes.data || [])
    const seenNames = new Set()
    const categoryTotals = catalog.map((c) => {
      seenNames.add(c.name)
      const amount = Math.round((byCategoryId[c.id] || byCategoryName[c.name] || 0) * 100) / 100
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
      data: {
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
          const cat = Array.isArray(row.expense_categories)
            ? row.expense_categories[0]
            : row.expense_categories
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
      },
      error: null,
    }
  },

  /**
   * Invoices issued in a date range (expected) vs payments received in the same range (collected).
   * Also shows how much of those period invoices has been paid to date.
   */
  async getExpectedVsCollectedReport({ from, to }) {
    if (!supabase) return dbUnavailable()

    let invQ = supabase
      .from('invoices')
      .select('id, number, issue_date, status, total, amount_paid, clients(name)')
      .in('status', ['issued', 'partial', 'paid'])
      .order('issue_date', { ascending: true })
    if (from) invQ = invQ.gte('issue_date', from)
    if (to) invQ = invQ.lte('issue_date', to)

    const [invRes, payRes] = await Promise.all([
      invQ,
      this.getIncomeReport({ from, to }),
    ])
    if (invRes.error) return mapError(invRes.error)
    if (payRes.error) return payRes

    const invoices = invRes.data || []
    let expected = 0
    let paidOnExpected = 0
    for (const inv of invoices) {
      expected += Number(inv.total) || 0
      paidOnExpected += Number(inv.amount_paid) || 0
    }
    expected = Math.round(expected * 100) / 100
    paidOnExpected = Math.round(paidOnExpected * 100) / 100
    const outstandingOnExpected = Math.round((expected - paidOnExpected) * 100) / 100
    const collected = payRes.data.total
    const gap = Math.round((expected - collected) * 100) / 100
    const collectionRate =
      expected > 0 ? Math.round((collected / expected) * 1000) / 10 : null

    return {
      data: {
        from: from || null,
        to: to || null,
        expected,
        invoiceCount: invoices.length,
        paidOnExpected,
        outstandingOnExpected,
        collected,
        paymentCount: payRes.data.paymentCount,
        collectedByMethod: payRes.data.byMethod,
        gap,
        collectionRate,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          issue_date: inv.issue_date,
          status: inv.status,
          client_name: inv.clients?.name || '—',
          total: Number(inv.total) || 0,
          amount_paid: Number(inv.amount_paid) || 0,
          balance: Math.round((Number(inv.total) - Number(inv.amount_paid || 0)) * 100) / 100,
        })),
      },
      error: null,
    }
  },

  /**
   * Cash-basis profit & loss for a date range.
   * Revenue = payments received. Costs = stock purchases (purchase orders)
   * + operating expenses. Net profit = revenue − costs.
   */
  async getProfitAndLossReport({ from, to }) {
    if (!supabase) return dbUnavailable()

    let poQ = supabase
      .from('purchase_orders')
      .select('amount, purchase_date, status')
      .neq('status', 'cancelled')
      .order('purchase_date', { ascending: true })
    if (from) poQ = poQ.gte('purchase_date', from)
    if (to) poQ = poQ.lte('purchase_date', to)

    const [incomeRes, expenseRes, poRes] = await Promise.all([
      this.getIncomeReport({ from, to }),
      this.getExpensesReport({ from, to }),
      poQ,
    ])
    if (incomeRes.error) return incomeRes
    if (expenseRes.error) return expenseRes
    if (poRes.error) return mapError(poRes.error)

    const round = (n) => Math.round((Number(n) || 0) * 100) / 100

    const poRows = poRes.data || []
    let stockPurchases = 0
    for (const row of poRows) stockPurchases += Number(row.amount) || 0
    stockPurchases = round(stockPurchases)

    const revenue = incomeRes.data.total
    const operatingExpenses = expenseRes.data.total
    const grossProfit = round(revenue - stockPurchases)
    const totalCosts = round(stockPurchases + operatingExpenses)
    const netProfit = round(revenue - totalCosts)
    const margin = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null

    return {
      data: {
        from: from || null,
        to: to || null,
        revenue,
        paymentCount: incomeRes.data.paymentCount,
        stockPurchases,
        purchaseOrderCount: poRows.length,
        operatingExpenses,
        expenseCount: expenseRes.data.expenseCount,
        grossProfit,
        totalCosts,
        netProfit,
        margin,
        expensesByCategory: expenseRes.data.byCategory,
      },
      error: null,
    }
  },

  async getClientStatement({ client_id, from, to }) {
    if (!supabase) return dbUnavailable()
    if (!client_id) {
      return { data: null, error: { message: 'Please select a client.' } }
    }

    const clientRes = await this.getClient(client_id)
    if (clientRes.error) return clientRes

    const { data: allInv, error: invErr } = await supabase
      .from('invoices')
      .select('id, number, issue_date, status, total, amount_paid, created_at')
      .eq('client_id', client_id)
      .in('status', ['draft', 'issued', 'partial', 'paid', 'void'])
      .order('issue_date', { ascending: true })
    if (invErr) return mapError(invErr)

    const { data: allPay, error: payErr } = await supabase
      .from('payments')
      .select('id, payment_date, amount, method, reference')
      .eq('client_id', client_id)
      .order('payment_date', { ascending: true })
    if (payErr) return mapError(payErr)

    const { data: allQuotes, error: quoteErr } = await supabase
      .from('quotations')
      .select('id, number, issue_date, status, total, created_at')
      .eq('client_id', client_id)
      .order('issue_date', { ascending: true })
    if (quoteErr) return mapError(quoteErr)

    const fromDate = from || '0001-01-01'
    const toDate = to || '9999-12-31'

    function inRange(dateStr) {
      if (!dateStr) return false
      return dateStr >= fromDate && dateStr <= toDate
    }

    function invoiceSortDate(inv) {
      return inv.issue_date || String(inv.created_at || '').slice(0, 10) || ''
    }

    function quoteSortDate(q) {
      return q.issue_date || String(q.created_at || '').slice(0, 10) || ''
    }

    let opening = 0
    for (const inv of allInv || []) {
      if (!invoiceAffectsClientBalance(inv.status)) continue
      const d = inv.issue_date || ''
      if (d && d < fromDate) {
        opening += Number(inv.total) || 0
      }
    }
    for (const pay of allPay || []) {
      // Payments always affect balance (recorded receipts).
      const d = pay.payment_date || ''
      if (d && d < fromDate) {
        opening -= Number(pay.amount) || 0
      }
    }
    opening = Math.round(opening * 100) / 100

    const lines = []
    for (const inv of allInv || []) {
      const sortDate = invoiceSortDate(inv)
      if (!sortDate || !inRange(sortDate)) continue

      const affectsBalance = invoiceAffectsClientBalance(inv.status)
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
      if (!inRange(pay.payment_date)) continue
      lines.push({
        id: pay.id,
        sortDate: pay.payment_date,
        type: 'payment',
        label: pay.reference || 'Payment',
        method: pay.method,
        inactive: false,
        affectsBalance: true,
        debit: 0,
        credit: Number(pay.amount) || 0,
      })
    }
    for (const q of allQuotes || []) {
      const sortDate = quoteSortDate(q)
      if (!sortDate || !inRange(sortDate)) continue
      // Quotations never affect client balance. Draft/sent/approved stay visible on
      // Accounts (awaiting install); converted/cancelled only under Show all.
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
      if (line.affectsBalance) {
        balance += line.debit - line.credit
      }
      return { ...line, balance: Math.round(balance * 100) / 100 }
    })

    const balanceLines = withBalance.filter((l) => l.affectsBalance)
    const periodCharges = balanceLines.reduce((s, l) => s + l.debit, 0)
    const periodCredits = balanceLines.reduce((s, l) => s + l.credit, 0)

    return {
      data: {
        client: clientRes.data,
        from: from || null,
        to: to || null,
        openingBalance: opening,
        closingBalance: Math.round(balance * 100) / 100,
        periodCharges: Math.round(periodCharges * 100) / 100,
        periodCredits: Math.round(periodCredits * 100) / 100,
        lines: withBalance,
      },
      error: null,
    }
  },

  // --- Expenses ---

  async listExpenseCategories({ activeOnly = false, withUsage = false } = {}) {
    if (!supabase) return dbUnavailable()
    let q = supabase.from('expense_categories').select('*')
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) return mapError(error)

    let usedIds = new Set()
    if (withUsage) {
      const { data: usedRows, error: usedErr } = await supabase
        .from('expenses')
        .select('category_id')
      if (usedErr) return mapError(usedErr)
      usedIds = new Set((usedRows || []).map((r) => r.category_id).filter(Boolean))
    }

    const rows = (data || []).map((c) =>
      withUsage ? { ...c, in_use: usedIds.has(c.id) } : c,
    )
    return { data: sortExpenseCategories(rows), error: null }
  },

  async saveExpenseCategory({ id, name, sort_order, active }) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    const trimmed = String(name || '').trim()
    if (!trimmed) {
      return { data: null, error: { message: 'Category name is required.' } }
    }
    const row = {
      name: trimmed,
      sort_order: Number(sort_order) || 100,
      active: active !== false,
      updated_at: new Date().toISOString(),
    }
    if (id) {
      const { data, error } = await supabase
        .from('expense_categories')
        .update(row)
        .eq('id', id)
        .select()
        .single()
      if (error) return mapError(error)
      return { data, error: null }
    }
    const { data, error } = await supabase
      .from('expense_categories')
      .insert({ ...row, created_at: new Date().toISOString() })
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async deleteExpenseCategory(id) {
    if (!assertAdmin()) return adminRequired()
    if (!supabase) return dbUnavailable()
    if (!id) {
      return { data: null, error: { message: 'Category id is required.' } }
    }
    const { count, error: countErr } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
    if (countErr) return mapError(countErr)
    if ((count || 0) > 0) {
      return {
        data: null,
        error: {
          message:
            'This category is used by existing expenses. Deactivate it instead of deleting.',
        },
      }
    }
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) return mapError(error)
    return { data: true, error: null }
  },

  async listExpenses({ from, to, category_id } = {}) {
    if (!supabase) return dbUnavailable()
    let q = supabase
      .from('expenses')
      .select('*, expense_categories(id, name)')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (from) q = q.gte('expense_date', from)
    if (to) q = q.lte('expense_date', to)
    if (category_id) q = q.eq('category_id', category_id)
    const { data, error } = await q
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  async getExpense(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('expenses')
      .select('*, expense_categories(id, name)')
      .eq('id', id)
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async saveExpense({
    id,
    expense_date,
    amount,
    category_id,
    vendor,
    method,
    reference,
    notes,
  }) {
    if (!supabase) return dbUnavailable()
    if (!category_id) {
      return { data: null, error: { message: 'Please select a category.' } }
    }
    const amt = Number(amount)
    if (!(amt > 0)) {
      return { data: null, error: { message: 'Enter an amount greater than zero.' } }
    }
    if (!expense_date) {
      return { data: null, error: { message: 'Choose an expense date.' } }
    }
    const row = {
      expense_date,
      amount: amt,
      category_id,
      vendor: vendor?.trim() || null,
      method: method || 'cash',
      reference: reference?.trim() || null,
      notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (id) {
      const { data, error } = await supabase
        .from('expenses')
        .update(row)
        .eq('id', id)
        .select('*, expense_categories(id, name)')
        .single()
      if (error) return mapError(error)
      return { data, error: null }
    }
    const { data, error } = await supabase
      .from('expenses')
      .insert(row)
      .select('*, expense_categories(id, name)')
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  async deleteExpense(id) {
    if (!supabase) return dbUnavailable()
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return mapError(error)
    return { data: true, error: null }
  },

  // --- Client proof uploads (private Storage bucket) ---

  /** Upload a bank slip / screenshot. Returns the storage path to save on the row. */
  async uploadClientProof(file, { clientId } = {}) {
    if (!supabase) return dbUnavailable()
    if (!file) return { data: null, error: { message: 'Choose a file to upload.' } }
    if (file.size > PROOF_MAX_BYTES) {
      return { data: null, error: { message: 'That file is larger than 10 MB. Please upload a smaller image or PDF.' } }
    }
    if (file.type && !PROOF_ALLOWED_TYPES.includes(file.type)) {
      return { data: null, error: { message: 'Please upload an image (JPG, PNG, WebP, HEIC) or a PDF.' } }
    }

    const safeName = String(file.name || 'proof')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(-60)
    const path = `${clientId || 'unknown'}/${Date.now()}-${safeName}`

    const { error } = await supabase.storage
      .from(PROOF_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) return mapError(error)
    return { data: { path }, error: null }
  },

  /** Short-lived link so staff can view a client's uploaded proof. */
  async getProofSignedUrl(path, expiresIn = 3600) {
    if (!supabase) return dbUnavailable()
    if (!path) return { data: null, error: { message: 'No attachment on this record.' } }
    const { data, error } = await supabase.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(path, expiresIn)
    if (error) return mapError(error)
    return { data: data?.signedUrl || null, error: null }
  },

  // --- Payments seen by the client ---

  /** Portal payments list with allocated / unallocated split per payment. */
  async listPaymentsForClient(clientId) {
    if (!supabase) return dbUnavailable()
    if (!clientId) return { data: null, error: { message: 'No client selected.' } }

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return mapError(error)

    const ids = (payments || []).map((p) => p.id)
    if (ids.length === 0) return { data: [], error: null }

    const { data: allocs, error: allocErr } = await supabase
      .from('payment_allocations')
      .select('payment_id, amount')
      .in('payment_id', ids)
    if (allocErr) return mapError(allocErr)

    const allocated = {}
    for (const a of allocs || []) {
      allocated[a.payment_id] = (allocated[a.payment_id] || 0) + (Number(a.amount) || 0)
    }

    const data = (payments || []).map((p) => {
      const used = Math.round((allocated[p.id] || 0) * 100) / 100
      const unallocated = Math.round(((Number(p.amount) || 0) - used) * 100) / 100
      return { ...p, allocated_amount: used, unallocated_amount: unallocated }
    })
    return { data, error: null }
  },

  // --- Payment notifications ("I've paid") ---

  async createPaymentNotification({
    client_id,
    invoice_id,
    amount,
    payment_date,
    method,
    reference,
    note,
    proof_path,
  }) {
    if (!supabase) return dbUnavailable()
    if (!client_id) return { data: null, error: { message: 'No client selected.' } }

    const amt = Number(amount)
    if (!(amt > 0)) {
      return { data: null, error: { message: 'Enter an amount greater than zero.' } }
    }
    if (!payment_date) {
      return { data: null, error: { message: 'Choose the date you paid.' } }
    }
    const allowed = PAYMENT_METHODS.map((m) => m.value)
    const payMethod = allowed.includes(method) ? method : 'eft'

    const { data, error } = await supabase
      .from('payment_notifications')
      .insert({
        client_id,
        invoice_id: invoice_id || null,
        amount: Math.round(amt * 100) / 100,
        payment_date,
        method: payMethod,
        reference: reference?.trim() || null,
        note: note?.trim() || null,
        proof_path: proof_path || null,
      })
      .select('*, invoices(id, number)')
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  /** Client's own submissions, so the portal can show "we're checking this". */
  async listPaymentNotificationsForClient(clientId) {
    if (!supabase) return dbUnavailable()
    if (!clientId) return { data: null, error: { message: 'No client selected.' } }
    const { data, error } = await supabase
      .from('payment_notifications')
      .select('*, invoices(id, number)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  async listPaymentNotifications({ status = 'pending' } = {}) {
    if (!supabase) return dbUnavailable()
    let query = supabase
      .from('payment_notifications')
      .select('*, clients(id, name), invoices(id, number)')
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  async getPaymentNotification(id) {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('payment_notifications')
      .select('*, clients(id, name), invoices(id, number)')
      .eq('id', id)
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  /** Staff outcome: accepted (a payment was recorded) or dismissed. */
  async resolvePaymentNotification(id, { status, payment_id = null } = {}) {
    if (!supabase) return dbUnavailable()
    if (!['accepted', 'dismissed', 'pending'].includes(status)) {
      return { data: null, error: { message: 'Unknown notification outcome.' } }
    }
    const { data, error } = await supabase
      .from('payment_notifications')
      .update({
        status,
        resolved_at: status === 'pending' ? null : new Date().toISOString(),
        resolved_payment_id: payment_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, clients(id, name), invoices(id, number)')
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Invoice disputes / queries ---

  /** Latest thread for an invoice (open one wins), with its messages. */
  async getInvoiceDispute(invoiceId) {
    if (!supabase) return dbUnavailable()
    const { data: threads, error } = await supabase
      .from('invoice_disputes')
      .select('*, invoices(id, number), clients(id, name)')
      .eq('invoice_id', invoiceId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return mapError(error)

    const dispute = (threads || [])[0]
    if (!dispute) return { data: null, error: null }

    const { data: messages, error: msgErr } = await supabase
      .from('invoice_dispute_messages')
      .select('*')
      .eq('dispute_id', dispute.id)
      .order('created_at', { ascending: true })
    if (msgErr) return mapError(msgErr)

    return { data: { ...dispute, messages: messages || [] }, error: null }
  },

  async getInvoiceDisputeForClient(invoiceId, clientId) {
    if (!clientId) return { data: null, error: { message: 'No client selected.' } }
    const res = await this.getInvoiceDispute(invoiceId)
    if (res.error) return res
    if (res.data && res.data.client_id !== clientId) {
      return { data: null, error: { message: 'Query not found.' } }
    }
    return res
  },

  /**
   * Post a message, opening a thread when there isn't an open one.
   * A reply after resolution starts a fresh thread.
   */
  async postDisputeMessage({ invoice_id, client_id, author_role, body, attachment_path }) {
    if (!supabase) return dbUnavailable()
    if (!invoice_id) return { data: null, error: { message: 'No invoice selected.' } }
    if (!client_id) return { data: null, error: { message: 'No client selected.' } }
    if (!String(body || '').trim()) {
      return { data: null, error: { message: 'Type a message before sending.' } }
    }
    const role = author_role === 'staff' ? 'staff' : 'client'

    const { data: open, error: openErr } = await supabase
      .from('invoice_disputes')
      .select('*')
      .eq('invoice_id', invoice_id)
      .eq('status', 'open')
      .maybeSingle()
    if (openErr) return mapError(openErr)

    let disputeId = open?.id
    if (!disputeId) {
      const now = new Date().toISOString()
      const { data: created, error: createErr } = await supabase
        .from('invoice_disputes')
        .insert({
          invoice_id,
          client_id,
          ...(role === 'staff'
            ? { staff_last_read_at: now }
            : { client_last_read_at: now }),
        })
        .select('id')
        .single()
      if (createErr) return mapError(createErr)
      disputeId = created.id
    }

    const { error: msgErr } = await supabase.from('invoice_dispute_messages').insert({
      dispute_id: disputeId,
      author_role: role,
      body: String(body).trim(),
      attachment_path: attachment_path || null,
    })
    if (msgErr) return mapError(msgErr)

    const now = new Date().toISOString()
    await supabase
      .from('invoice_disputes')
      .update({
        updated_at: now,
        ...(role === 'staff' ? { staff_last_read_at: now } : { client_last_read_at: now }),
      })
      .eq('id', disputeId)

    return this.getInvoiceDispute(invoice_id)
  },

  async listOpenDisputes() {
    if (!supabase) return dbUnavailable()
    const { data, error } = await supabase
      .from('invoice_disputes')
      .select('*, invoices(id, number, total), clients(id, name)')
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
    if (error) return mapError(error)
    return { data: data || [], error: null }
  },

  /**
   * Unread message counts keyed by invoice_id for a viewer role.
   * Optional client_id scopes the portal to one account.
   */
  async listInvoiceUnreadCounts({ role = 'client', client_id } = {}) {
    if (!supabase) return dbUnavailable()
    const viewer = role === 'staff' ? 'staff' : 'client'
    let q = supabase
      .from('invoice_disputes')
      .select(
        'id, invoice_id, client_id, client_last_read_at, staff_last_read_at, invoice_dispute_messages(id, author_role, created_at)',
      )
    if (client_id) q = q.eq('client_id', client_id)
    const { data, error } = await q
    if (error) return mapError(error)

    const byInvoice = {}
    for (const row of data || []) {
      const unread = disputeUnreadCount(
        {
          ...row,
          messages: row.invoice_dispute_messages || [],
        },
        viewer,
      )
      if (unread < 1) continue
      byInvoice[row.invoice_id] = (byInvoice[row.invoice_id] || 0) + unread
    }
    return { data: byInvoice, error: null }
  },

  async setDisputeStatus(id, status) {
    if (!supabase) return dbUnavailable()
    if (!['open', 'resolved'].includes(status)) {
      return { data: null, error: { message: 'Unknown query status.' } }
    }
    const { data, error } = await supabase
      .from('invoice_disputes')
      .update({
        status,
        resolved_at: status === 'resolved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  /**
   * Mark the thread as read for a role (called when they expand the section).
   * Returns the new cursor timestamp so the UI can clear the unread badge.
   */
  async markDisputeRead(disputeId, role) {
    if (!supabase) return dbUnavailable()
    if (!disputeId) return { data: null, error: { message: 'No query selected.' } }
    const col = role === 'staff' ? 'staff_last_read_at' : 'client_last_read_at'
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('invoice_disputes')
      .update({ [col]: now })
      .eq('id', disputeId)
      .select('id, client_last_read_at, staff_last_read_at')
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Quotation decline ---

  async declineQuotation(id, reason) {
    if (!supabase) return dbUnavailable()
    const trimmed = String(reason || '').trim()
    if (!trimmed) {
      return { data: null, error: { message: 'Give the client a short reason for declining.' } }
    }
    const existing = await this.getQuotation(id)
    if (existing.error) return existing
    if (existing.data.status === 'converted') {
      return { data: null, error: { message: 'This quotation was already converted to an invoice.' } }
    }

    const { data, error } = await supabase
      .from('quotations')
      .update({
        status: 'declined',
        decline_reason: trimmed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return mapError(error)
    return { data, error: null }
  },

  // --- Staff dashboard ---

  /** Everything the dashboard needs to show real work waiting for staff. */
  async getOpsDashboardSummary() {
    if (!supabase) return dbUnavailable()
    const today = localTodayIso()
    const monthStart = `${today.slice(0, 7)}-01`

    const [notifRes, disputeRes, quoteRes, invoiceRes, paymentRes] = await Promise.all([
      supabase
        .from('payment_notifications')
        .select('*, clients(id, name), invoices(id, number)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_disputes')
        .select('*, invoices(id, number), clients(id, name)')
        .eq('status', 'open')
        .order('updated_at', { ascending: false }),
      supabase
        .from('quotations')
        .select('id, number, total, issue_date, created_at, clients(id, name)')
        .eq('source', 'portal')
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id, number, status, total, amount_paid, issue_date, due_date, client_id, clients(id, name)')
        .in('status', BALANCE_INVOICE_STATUSES),
      supabase.from('payments').select('amount, payment_date').gte('payment_date', monthStart),
    ])

    if (notifRes.error) return mapError(notifRes.error)
    if (disputeRes.error) return mapError(disputeRes.error)
    if (quoteRes.error) return mapError(quoteRes.error)
    if (invoiceRes.error) return mapError(invoiceRes.error)
    if (paymentRes.error) return mapError(paymentRes.error)

    const invoices = invoiceRes.data || []
    const receivables = summarizeReceivables(invoices, today)

    const overdueInvoices = invoices
      .filter((inv) => {
        const balance = Math.round((Number(inv.total) - Number(inv.amount_paid || 0)) * 100) / 100
        if (balance <= 0.001) return false
        const due = invoiceEffectiveDueDate(inv)
        return Boolean(due && due < today)
      })
      .sort((a, b) => invoiceEffectiveDueDate(a).localeCompare(invoiceEffectiveDueDate(b)))

    const collectedThisMonth =
      Math.round(
        (paymentRes.data || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) * 100,
      ) / 100

    return {
      data: {
        today,
        paymentNotifications: notifRes.data || [],
        disputes: disputeRes.data || [],
        quoteRequests: quoteRes.data || [],
        overdueInvoices,
        receivables,
        collectedThisMonth,
      },
      error: null,
    }
  },
}

function camelToAction(name) {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
}

async function callOps(action, args) {
  const { data, error } = await invokeFn('ops', { body: { action, args } }, { withAuth: true })
  if (error) {
    return {
      data: null,
      error: { message: error.message, context: error.context },
    }
  }
  if (data?.success === false) {
    return { data: null, error: { message: data.message || 'Request failed.' } }
  }
  return { data: data?.data, error: null }
}

function wrapOpsApi(direct) {
  const wrapped = { ...direct }
  const skip = new Set(['invoke'])

  for (const key of Object.keys(direct)) {
    if (typeof direct[key] !== 'function' || key.startsWith('_') || skip.has(key)) continue

    wrapped[key] = async (...args) => {
      const res = await callOps(camelToAction(key), args)
      if (res.error) return res

      if (
        key === 'getBillingDocumentBundle' ||
        key === 'getBillingDocumentBundleForClient'
      ) {
        if (!res.data) return res
        return {
          data: prepareBillingDocumentBundle(res.data),
          error: null,
        }
      }

      if (
        key === 'getPaymentDocumentBundle' ||
        key === 'getPaymentDocumentBundleForClient'
      ) {
        if (!res.data) return res
        return {
          data: preparePaymentDocumentBundle(res.data),
          error: null,
        }
      }

      return res
    }
  }

  return wrapped
}

export const opsApi = AUTH_BYPASS ? directOpsApi : wrapOpsApi(directOpsApi)
