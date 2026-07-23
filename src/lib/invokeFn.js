import { supabaseAnonKey, supabaseUrl } from './supabase'

function getSessionToken() {
  try {
    return localStorage.getItem('session') || ''
  } catch {
    return ''
  }
}

/**
 * Invoke a Supabase Edge Function.
 * Ready for Phase 6 JWT auth; during bypass, callers may use opsApi with direct DB access instead.
 */
export async function invokeFn(name, options = {}, { withAuth = true } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      data: null,
      error: { message: 'Supabase is not configured (missing env vars).' },
    }
  }

  const token = getSessionToken()
  if (withAuth && !token) {
    return {
      data: null,
      error: {
        message: 'Your session has expired. Please sign in again.',
        context: { status: 401 },
      },
    }
  }

  const headers = {
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
    ...(withAuth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const q = name.indexOf('?')
  const fnPath = q === -1 ? name : name.slice(0, q)
  const query = q === -1 ? '' : name.slice(q)
  const url = `${supabaseUrl}/functions/v1/${fnPath}${query}`

  try {
    const init = {
      method: options.method || 'POST',
      headers,
    }
    if (options.body !== undefined) {
      init.body =
        typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    }

    const res = await fetch(url, init)
    let data = null
    const text = await res.text()
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text }
      }
    }

    if (!res.ok) {
      return {
        data: data && typeof data === 'object' ? data : null,
        error: {
          message: data?.message || res.statusText || 'Request failed',
          context: { status: res.status },
        },
      }
    }

    if (data?.session_token) {
      try {
        localStorage.setItem('session', data.session_token)
      } catch {
        /* ignore */
      }
    }

    return { data, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Network request failed',
      },
    }
  }
}
