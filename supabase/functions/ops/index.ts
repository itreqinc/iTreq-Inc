import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, fail, json, okData } from '../_shared/http.ts'
import {
  adminClient,
  isStaffLike,
  loadSessionUser,
  OpsError,
  requireSession,
  requireStaffOps,
  userRole,
} from '../_shared/session.ts'
import { handlers } from './handlers.ts'

/** Any signed-in user (portal quote builder, settings for tax rate). */
const SESSION_READ_ACTIONS = new Set([
  'get_settings',
  'list_products',
  'list_trackable_items',
])

/** Portal flows — session only (not gated on ops hours). */
const PORTAL_SESSION_ACTIONS = new Set([
  'create_portal_quotation_from_catalog',
  'update_portal_quotation_from_catalog',
  'delete_quotation_for_client',
  'get_quotation_for_client',
  'get_invoice_for_client',
  'get_billing_document_bundle_for_client',
  'list_payments_for_client',
  'get_payment_for_client',
  'get_payment_document_bundle_for_client',
  'create_payment_notification',
  'list_payment_notifications_for_client',
  'get_invoice_dispute_for_client',
  'post_dispute_message',
  'upload_client_proof',
  'list_invoice_unread_counts',
])

async function authorize(
  action: string,
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
  args: unknown[],
) {
  if (action === 'get_status') {
    return await requireSession(supabase, req, body)
  }

  if (SESSION_READ_ACTIONS.has(action) || PORTAL_SESSION_ACTIONS.has(action)) {
    return await requireSession(supabase, req, body)
  }

  if (action === 'list_invoices') {
    const opts = (args[0] || {}) as Record<string, unknown>
    if (opts.forPortal) {
      return await requireSession(supabase, req, body)
    }
    const gate = await requireStaffOps(supabase, req, body)
    if (gate.error) return gate
    if (userRole(gate.user!) === 'client') {
      return { error: fail(403, 'Staff access required.') }
    }
    return gate
  }

  if (action === 'list_quotations') {
    const opts = (args[0] || {}) as Record<string, unknown>
    if (opts.client_id) {
      const gate = await requireSession(supabase, req, body)
      if (gate.error) return gate
      if (userRole(gate.user!) === 'client') return gate
      return await requireStaffOps(supabase, req, body)
    }
    const gate = await requireStaffOps(supabase, req, body)
    if (gate.error) return gate
    if (userRole(gate.user!) === 'client') {
      return { error: fail(403, 'Staff access required.') }
    }
    return gate
  }

  if (action === 'get_client_statement') {
    const gate = await requireSession(supabase, req, body)
    if (gate.error) return gate
    if (userRole(gate.user!) === 'client') return gate
    return await requireStaffOps(supabase, req, body)
  }

  if (action === 'get_proof_signed_url') {
    const gate = await requireSession(supabase, req, body)
    if (gate.error) return gate
    if (userRole(gate.user!) === 'client') return gate
    if (isStaffLike(gate.user!)) {
      return await requireStaffOps(supabase, req, body)
    }
    return gate
  }

  const gate = await requireStaffOps(supabase, req, body)
  if (gate.error) return gate
  if (userRole(gate.user!) === 'client') {
    return { error: fail(403, 'Staff access required.') }
  }
  return gate
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '').trim().toLowerCase()
    if (!action) {
      return fail(400, 'action is required')
    }

    const handler = handlers[action]
    if (!handler) {
      return fail(400, `Unknown action: ${action}`)
    }

    const supabase = adminClient()
    const args = Array.isArray(body.args) ? body.args : []

    const gate = await authorize(action, supabase, req, body, args)
    if (gate.error) return gate.error

    const data = await handler({ sb: supabase, user: gate.user! }, args)
    return okData(data)
  } catch (err) {
    if (err instanceof OpsError) {
      return fail(err.status, err.message)
    }
    console.error('ops error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return fail(500, message)
  }
})
