import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  AUTH_BYPASS,
  BYPASS_ROLE_KEY,
  ROLES,
  normalizeRole,
} from '../lib/authConfig'
import { invokeFn } from '../lib/invokeFn'

const AuthContext = createContext(null)

function readBypassRole() {
  try {
    const stored = localStorage.getItem(BYPASS_ROLE_KEY)
    if (stored === ROLES.client || stored === ROLES.staff) return stored
  } catch {
    /* ignore */
  }
  return ROLES.staff
}

function bypassUser(role) {
  return {
    id: `bypass-${role}`,
    role: normalizeRole(role),
    name: role === ROLES.client ? 'Dev Client' : 'Dev Staff',
    bypass: true,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(async () => {
    const token = localStorage.getItem('session')
    try {
      if (token && !AUTH_BYPASS) {
        await invokeFn(
          'logout',
          { body: { session_token: token } },
          { withAuth: false },
        )
      }
    } catch {
      /* clear locally anyway */
    } finally {
      localStorage.removeItem('session')
      if (!AUTH_BYPASS) setUser(null)
      else setUser(bypassUser(readBypassRole()))
    }
  }, [])

  const validateSession = useCallback(async (token) => {
    if (AUTH_BYPASS) {
      setUser(bypassUser(readBypassRole()))
      setLoading(false)
      return
    }

    try {
      const { data, error } = await invokeFn(
        'validate-session',
        { headers: { Authorization: `Bearer ${token}` } },
        { withAuth: false },
      )

      const status = error?.context?.status
      if (status === 401 || status === 403 || data?.success === false) {
        localStorage.removeItem('session')
        setUser(null)
      } else if (error || !data?.user) {
        console.warn('Session validation skipped:', error?.message || data?.message)
      } else {
        setUser(data.user)
        if (data.session_token) {
          localStorage.setItem('session', data.session_token)
        }
      }
    } catch (err) {
      console.error('Session validation failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loginWithToken = useCallback(
    async (token) => {
      localStorage.setItem('session', token)
      await validateSession(token)
    },
    [validateSession],
  )

  const setBypassRole = useCallback((role) => {
    const next = normalizeRole(role) === ROLES.client ? ROLES.client : ROLES.staff
    try {
      localStorage.setItem(BYPASS_ROLE_KEY, next)
    } catch {
      /* ignore */
    }
    if (AUTH_BYPASS) setUser(bypassUser(next))
  }, [])

  useEffect(() => {
    if (AUTH_BYPASS) {
      setUser(bypassUser(readBypassRole()))
      setLoading(false)
      return
    }

    const token = localStorage.getItem('session')
    if (token) validateSession(token)
    else setLoading(false)
  }, [validateSession])

  const value = useMemo(
    () => ({
      user,
      loading,
      authBypass: AUTH_BYPASS,
      loginWithToken,
      logout,
      setBypassRole,
    }),
    [user, loading, loginWithToken, logout, setBypassRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
