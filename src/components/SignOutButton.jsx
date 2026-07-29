import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOpsAlert } from '../admin/OpsAlertContext'

/**
 * Sign-out control with confirm dialog. Must render under OpsAlertProvider.
 */
export function SignOutButton({ className, label = 'Sign out' }) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { confirm } = useOpsAlert()

  async function handleClick() {
    const ok = await confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to continue.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    })
    if (!ok) return
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {label}
    </button>
  )
}
