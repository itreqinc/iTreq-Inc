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
  isStaffLike,
  normalizeRole,
} from '../lib/authConfig'
import { authAction } from '../lib/authApi'

const AuthContext = createContext(null)

function readBypassRole() {
  try {
    const stored = localStorage.getItem(BYPASS_ROLE_KEY)
    const role = normalizeRole(stored)
    if (role === ROLES.client || role === ROLES.staff || role === ROLES.admin) {
      return role
    }
  } catch {
    /* ignore */
  }
  return ROLES.staff
}

function bypassUser(role) {
  const r = normalizeRole(role)
  const name =
    r === ROLES.client
      ? 'Dev Client'
      : r === ROLES.admin
        ? 'Dev Admin'
        : 'Dev Staff'
  return {
    id: `bypass-${r}`,
    role: r,
    name,
    email: null,
    phone: null,
    client_id: null,
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
        await authAction('logout', { session_token: token }, { withAuth: false })
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
      const { data, error } = await authAction(
        'validate_session',
        { session_token: token },
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
    async (token, userFromLogin = null) => {
      localStorage.setItem('session', token)
      if (userFromLogin) {
        setUser(userFromLogin)
        setLoading(false)
        return
      }
      await validateSession(token)
    },
    [validateSession],
  )

  const applySession = useCallback(async (data) => {
    if (!data?.session_token || !data?.user) {
      throw new Error(data?.message || 'Login failed')
    }
    localStorage.setItem('session', data.session_token)
    setUser(data.user)
    setLoading(false)
    return data.user
  }, [])

  const setBypassRole = useCallback((role) => {
    const raw = normalizeRole(role)
    const next =
      raw === ROLES.client
        ? ROLES.client
        : raw === ROLES.admin
          ? ROLES.admin
          : ROLES.staff
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
      applySession,
      logout,
      setBypassRole,
      isStaffLike: user ? isStaffLike(user.role) : false,
    }),
    [user, loading, loginWithToken, applySession, logout, setBypassRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
