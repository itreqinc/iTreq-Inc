import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { DEV_AUTH_SWITCHER } from '../lib/authConfig'
import { SeedUserPicker } from './SeedUserPicker'

/**
 * Floating mid-session switcher. Prefer /login seed picker when changing roles.
 * Requires import.meta.env.DEV + VITE_DEV_AUTH_SWITCHER=true
 * and Edge ALLOW_DEV_IMPERSONATE=true.
 */
export function DevAuthSwitcher() {
  const { authBypass, logout } = useAuth()
  const [open, setOpen] = useState(false)

  if (!DEV_AUTH_SWITCHER || authBypass) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm font-sans text-xs">
      {open ? (
        <div className="rounded-2xl border border-amber-500/40 bg-ink-950/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-200">Switch user</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <SeedUserPicker
            title="Seed accounts"
            subtitle="Picks a real session. Or sign out to restart at /login."
            onPicked={() => setOpen(false)}
          />
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              await logout()
              window.location.assign('/login')
            }}
            className="mt-3 w-full rounded-lg border border-white/10 px-2 py-1.5 text-ink-300 hover:bg-white/5"
          >
            Sign out → login picker
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-2 font-semibold text-amber-100 shadow-lg hover:bg-amber-500/25"
        >
          Switch user
        </button>
      )}
    </div>
  )
}
