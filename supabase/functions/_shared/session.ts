import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fail, json } from './http.ts'

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_SLIDE_REMAINING_MS = 2 * 60 * 60 * 1000
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000
export const OPS_TZ = 'Africa/Gaborone'
export const OPS_START_HOUR = 7
export const OPS_END_HOUR = 18

export type UserRow = Record<string, unknown>

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

function bytesToHex(buf: ArrayBuffer | Uint8Array) {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  return bytesToHex(await crypto.subtle.digest('SHA-256', data))
}

export function bearerToken(req: Request) {
  const h = req.headers.get('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() || ''
}

function isWithinOpsHours(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPS_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    minute: 'numeric',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const weekday = parts.weekday
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const hour = Number(parts.hour === '24' ? 0 : parts.hour)
  const minute = Number(parts.minute)
  const mins = hour * 60 + minute
  return mins >= OPS_START_HOUR * 60 && mins < OPS_END_HOUR * 60
}

export function computeOpsAccess(user: UserRow) {
  const role = String(user.role || '')
  if (role === 'admin') {
    return { allowed: true, reason: 'admin', after_hours_until: user.after_hours_until ?? null }
  }
  if (role !== 'staff') {
    return { allowed: false, reason: 'not_staff', after_hours_until: null }
  }
  const untilRaw = user.after_hours_until ? String(user.after_hours_until) : ''
  if (untilRaw) {
    const until = new Date(untilRaw).getTime()
    if (!Number.isNaN(until) && Date.now() < until) {
      return { allowed: true, reason: 'delegated', after_hours_until: user.after_hours_until }
    }
  }
  if (isWithinOpsHours()) {
    return {
      allowed: true,
      reason: 'business_hours',
      after_hours_until: user.after_hours_until ?? null,
    }
  }
  return {
    allowed: false,
    reason: 'outside_hours',
    after_hours_until: user.after_hours_until ?? null,
  }
}

async function maybeSlideSession(
  supabase: SupabaseClient,
  session: { id: string; expires_at: string },
) {
  const remainingMs = new Date(session.expires_at).getTime() - Date.now()
  if (remainingMs >= SESSION_SLIDE_REMAINING_MS) return
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await supabase
    .from('auth_sessions')
    .update({ expires_at: expiresAt })
    .eq('id', session.id)
    .is('revoked_at', null)
}

function isSessionIdle(lastActivityAt: string | null | undefined) {
  const t = lastActivityAt ? new Date(lastActivityAt).getTime() : NaN
  if (!Number.isFinite(t)) return true
  return Date.now() - t > SESSION_IDLE_MS
}

export async function loadSessionUser(
  supabase: SupabaseClient,
  token: string,
  opts: { recordActivity?: boolean } = {},
): Promise<UserRow | null> {
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const nowIso = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at, last_activity_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!session || session.revoked_at || session.expires_at < nowIso) return null
  if (isSessionIdle(session.last_activity_at)) return null

  if (opts.recordActivity) {
    await supabase
      .from('auth_sessions')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', session.id)
      .is('revoked_at', null)
  }

  await maybeSlideSession(supabase, session)

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .eq('is_active', true)
    .maybeSingle()
  if (userErr) throw userErr
  return user as UserRow | null
}

export function userRole(user: UserRow) {
  return String(user.role || '').trim().toLowerCase()
}

export function isAdmin(user: UserRow) {
  return userRole(user) === 'admin'
}

export function isStaffLike(user: UserRow) {
  const r = userRole(user)
  return r === 'staff' || r === 'admin'
}

export function portalClientId(user: UserRow) {
  const id = user.client_id
  return id ? String(id) : ''
}

/** Staff with linked client cannot manage that client's docs in staff ops view. */
export function isOwnClientBlocked(user: UserRow, clientId: string | null | undefined) {
  if (!clientId) return false
  if (userRole(user) !== 'staff') return false
  const own = portalClientId(user)
  return own && String(clientId) === own
}

export function assertNotOwnClient(user: UserRow, clientId: string | null | undefined) {
  if (isOwnClientBlocked(user, clientId)) {
    throw new OpsError(
      'You cannot manage your own account documents in staff view. Switch to client view instead.',
      403,
    )
  }
}

export class OpsError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function requireSession(
  supabase: SupabaseClient,
  req: Request,
  body: Record<string, unknown>,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) {
    return { error: fail(401, 'Session expired. Please sign in again.') }
  }
  return { user }
}

export async function requirePortalUser(
  supabase: SupabaseClient,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireSession(supabase, req, body)
  if (gate.error) return gate
  const user = gate.user!
  const clientId = portalClientId(user)
  if (!clientId) {
    return { error: fail(403, 'Portal access requires a linked client account.') }
  }
  return { user, clientId }
}

export async function requireStaffOps(
  supabase: SupabaseClient,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireSession(supabase, req, body)
  if (gate.error) return gate
  const user = gate.user!
  if (!isStaffLike(user)) {
    return { error: fail(403, 'Staff access required.') }
  }
  const ops = computeOpsAccess(user)
  if (!ops.allowed) {
    return {
      error: fail(
        403,
        'Ops is available Monday–Friday 07:00–18:00 (Africa/Gaborone), unless an admin grants after-hours access.',
        { ops_access: ops },
      ),
    }
  }
  return { user, ops }
}

export async function requireAdmin(
  supabase: SupabaseClient,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireSession(supabase, req, body)
  if (gate.error) return gate
  const user = gate.user!
  if (!isAdmin(user)) {
    return { error: fail(403, 'Admin access required.') }
  }
  return { user }
}

/** Client portal action scoped to session client_id (ignores body client_id). */
export function enforcePortalClient(user: UserRow, bodyClientId: string | null | undefined) {
  const sessionClient = portalClientId(user)
  if (!sessionClient) throw new OpsError('No client account linked.', 403)
  if (bodyClientId && String(bodyClientId) !== sessionClient) {
    throw new OpsError('Not found.', 404)
  }
  return sessionClient
}

export function mapDbError(err: unknown): OpsError {
  const raw = err instanceof Error ? err.message : String(err || '')
  const lower = raw.toLowerCase()
  if (lower.includes('insufficient stock')) {
    return new OpsError(raw.replace(/^.*Insufficient stock/i, 'Insufficient stock'), 400)
  }
  if (lower.includes('duplicate') || lower.includes('unique')) {
    return new OpsError('That record already exists. Check the details and try again.', 400)
  }
  if (raw.length < 120 && !lower.includes('pgrst') && !lower.includes('postgres')) {
    return new OpsError(raw, 400)
  }
  return new OpsError('Something went wrong. Please try again.', 500)
}
