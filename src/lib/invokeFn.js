import { supabaseAnonKey, supabaseUrl } from './supabase'

function getSessionToken() {
  try {
    return localStorage.getItem('session') || ''
  } catch {
    return ''
  }
}

function isNetworkFetchError(err) {
  if (!err) return false
  if (err.name === 'TypeError' || err.name === 'NetworkError') return true
  const raw = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|load failed|network request failed|fetch aborted|aborted/i.test(
    raw,
  )
}

function buildHeaders(options, withAuth, token) {
  return {
    apikey: supabaseAnonKey,
    'Content-Type': 'application/json',
    ...(withAuth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }
}

function functionUrl(name) {
  const q = name.indexOf('?')
  const fnPath = q === -1 ? name : name.slice(0, q)
  const query = q === -1 ? '' : name.slice(q)
  return `${supabaseUrl}/functions/v1/${fnPath}${query}`
}

function parseResponsePayload(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function normalizeHttpResult(status, text) {
  const data = parseResponsePayload(text)
  if (status < 200 || status >= 300) {
    return {
      data: data && typeof data === 'object' ? data : null,
      error: {
        message: data?.message || `Request failed (${status})`,
        context: { status },
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
}

async function fetchOnce(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  return normalizeHttpResult(res.status, text)
}

/** Fallback when fetch() is blocked/aborted by extensions or flaky networks. */
function xhrOnce(url, method, headers, body) {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open(method || 'POST', url, true)
      for (const [key, value] of Object.entries(headers || {})) {
        if (value != null && value !== '') xhr.setRequestHeader(key, String(value))
      }
      xhr.onload = () => resolve(normalizeHttpResult(xhr.status, xhr.responseText || ''))
      xhr.onerror = () =>
        resolve({
          data: null,
          error: { message: 'Failed to fetch', network: true },
        })
      xhr.ontimeout = () =>
        resolve({
          data: null,
          error: { message: 'Request timed out. Please try again.', network: true },
        })
      xhr.timeout = 60000
      xhr.send(body ?? null)
    } catch (err) {
      resolve({
        data: null,
        error: {
          message: err instanceof Error ? err.message : 'Network request failed',
          network: true,
        },
      })
    }
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

  const headers = buildHeaders(options, withAuth, token)
  const url = functionUrl(name)
  const method = options.method || 'POST'
  let body
  if (options.body !== undefined) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  }

  const init = {
    method,
    headers,
    cache: 'no-store',
  }
  if (body !== undefined) init.body = body

  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchOnce(url, init)
    } catch (err) {
      lastError = err
      if (!isNetworkFetchError(err) || attempt === 2) break
      await sleep(250 * (attempt + 1))
    }
  }

  // One XHR attempt — helps when a browser extension breaks window.fetch.
  const xhrResult = await xhrOnce(url, method, headers, body)
  if (!xhrResult.error || !xhrResult.error.network) {
    return xhrResult
  }

  const raw = lastError instanceof Error ? lastError.message : 'Network request failed'
  const online =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  return {
    data: null,
    error: {
      message: online
        ? 'Could not reach the server. Refresh the page, sign out and back in, then try again. If it keeps failing, check the browser Network tab for the “ops” request.'
        : 'You appear to be offline. Check your connection and try again.',
      network: true,
      cause: raw,
    },
  }
}
