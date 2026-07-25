/**
 * Bordered fieldset with a legend — used for dates and other labeled capture groups.
 * Dates typically use align="center"; item rows stay left-aligned.
 */
export function FieldBox({
  label,
  align = 'left',
  required = false,
  className = '',
  children,
}) {
  return (
    <fieldset
      className={`min-w-0 rounded-xl border border-white/10 bg-ink-950/60 px-3.5 pb-3.5 pt-1 ${className}`}
    >
      <legend
        className={`w-auto px-2 text-xs font-medium uppercase tracking-wider text-ink-300 ${
          align === 'center' ? 'mx-auto text-center' : ''
        }`}
      >
        {label}
        {required ? <span className="text-red-300"> *</span> : null}
      </legend>
      {children}
    </fieldset>
  )
}
