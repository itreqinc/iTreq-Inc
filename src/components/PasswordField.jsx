import { useId, useState } from 'react'
import { adminFieldClass } from '../admin/ui'

const EYE_OPEN = [
  'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z',
  'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
]

const EYE_OFF =
  'M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88'

function EyeIcon({ off }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      {off ? (
        <path d={EYE_OFF} />
      ) : (
        EYE_OPEN.map((d) => <path key={d} d={d} />)
      )}
    </svg>
  )
}

/**
 * Password input with show/hide toggle (eye) on the right.
 * Use this for every password field in the app.
 */
export function PasswordField({
  value,
  onChange,
  className = '',
  inputClassName = '',
  autoComplete = 'current-password',
  id,
  name,
  required,
  minLength,
  disabled,
  placeholder,
  ...rest
}) {
  const autoId = useId()
  const inputId = id || autoId
  const [visible, setVisible] = useState(false)

  return (
    <div className={`relative mt-1 ${className}`}>
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        disabled={disabled}
        placeholder={placeholder}
        className={`${adminFieldClass} pr-11 ${inputClassName}`.trim()}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 transition hover:text-ink-200 disabled:opacity-40"
      >
        <EyeIcon off={visible} />
      </button>
    </div>
  )
}
