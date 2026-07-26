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
  VIEW_MODES,
  canAccessOps,
  isDualRole,
  isStaffLike,
  normalizeRole,
  readViewMode,
  writeViewMode,
  writeSessionRole,
  clearSessionRole,
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
    client_id: r === ROLES.client || r === ROLES.staff ? 'bypass-client' : null,
    must_change_password: false,
    after_hours_until: null,
    bypass: true,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [opsAccess, setOpsAccess] = useState(null)
  const [viewMode, setViewModeState] = useState(() => readViewMode())
  const [loading, setLoading] = useState(true)

  const setViewMode = useCallback((mode) => {
    const next = mode === VIEW_MODES.client ? VIEW_MODES.client : VIEW_MODES.staff
    writeViewMode(next)
    setViewModeState(next)
  }, [])

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
      clearSessionRole()
      setOpsAccess(null)
      if (!AUTH_BYPASS) setUser(null)
      else setUser(bypassUser(readBypassRole()))
    }
  }, [])

  const ingestAuthPayload = useCallback((data) => {
    if (data?.user) {
      setUser(data.user)
      writeSessionRole(data.user.role)
    }
    if (data?.ops_access) setOpsAccess(data.ops_access)
    else if (data?.user) setOpsAccess(null)
  }, [])

  const validateSession = useCallback(async (token) => {
    if (AUTH_BYPASS) {
      const role = readBypassRole()
      setUser(bypassUser(role))
      writeSessionRole(role)
      setOpsAccess({ allowed: true, reason: 'bypass' })
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
        clearSessionRole()
        setUser(null)
        setOpsAccess(null)
      } else if (error || !data?.user) {
        console.warn('Session validation skipped:', error?.message || data?.message)
      } else {
        ingestAuthPayload(data)
        if (data.session_token) {
          localStorage.setItem('session', data.session_token)
        }
      }
    } catch (err) {
      console.error('Session validation failed:', err)
    } finally {
      setLoading(false)
    }
  }, [ingestAuthPayload])

  const loginWithToken = useCallback(
    async (token, userFromLogin = null) => {
      localStorage.setItem('session', token)
      if (userFromLogin) {
        setUser(userFromLogin)
        writeSessionRole(userFromLogin.role)
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
    ingestAuthPayload(data)
    setLoading(false)
    return data.user
  }, [ingestAuthPayload])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { data, error } = await authAction(
      'change_password',
      {
        current_password: currentPassword,
        new_password: newPassword,
      },
      { withAuth: true },
    )
    if (error || data?.success === false) {
      throw new Error(error?.message || data?.message || 'Could not change password')
    }
    ingestAuthPayload(data)
    return data.user
  }, [ingestAuthPayload])

  const updateProfile = useCallback(async (payload) => {
    const { data, error } = await authAction('update_profile', payload, { withAuth: true })
    if (error || data?.success === false) {
      throw new Error(error?.message || data?.message || 'Could not update profile')
    }
    ingestAuthPayload(data)
    return data.user
  }, [ingestAuthPayload])

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
    writeSessionRole(next)
    if (AUTH_BYPASS) setUser(bypassUser(next))
  }, [])

  useEffect(() => {
    if (AUTH_BYPASS) {
      const role = readBypassRole()
      setUser(bypassUser(role))
      writeSessionRole(role)
      setOpsAccess({ allowed: true, reason: 'bypass' })
      setLoading(false)
      return
    }

    const token = localStorage.getItem('session')
    if (token) validateSession(token)
    else {
      clearSessionRole()
      setLoading(false)
    }
  }, [validateSession])

  const dualRole = isDualRole(user)
  const effectiveViewMode = dualRole ? viewMode : isStaffLike(user?.role) ? VIEW_MODES.staff : VIEW_MODES.client
  const opsAllowed = canAccessOps(user, opsAccess)

  const value = useMemo(
    () => ({
      user,
      loading,
      authBypass: AUTH_BYPASS,
      opsAccess,
      opsAllowed,
      viewMode: effectiveViewMode,
      setViewMode,
      dualRole,
      loginWithToken,
      applySession,
      changePassword,
      updateProfile,
      logout,
      setBypassRole,
      isStaffLike: user ? isStaffLike(user.role) : false,
    }),
    [
      user,
      loading,
      opsAccess,
      opsAllowed,
      effectiveViewMode,
      setViewMode,
      dualRole,
      loginWithToken,
      applySession,
      changePassword,
      updateProfile,
      logout,
      setBypassRole,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
