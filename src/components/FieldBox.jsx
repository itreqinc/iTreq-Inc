/**
 * Bordered fieldset with a legend — used for dates and other labeled capture groups.
 * Dates typically use align="center"; item rows stay left-aligned.
 * Pass size="compact" for toolbar density.
 */
export function FieldBox({
  label,
  align = 'left',
  required = false,
  size = 'default',
  className = '',
  children,
}) {
  const compact = size === 'compact'
  return (
    <fieldset
      className={`min-w-0 rounded-xl border border-white/10 bg-ink-950/60 ${
        compact ? 'px-2.5 pb-2.5 pt-1' : 'px-3.5 pb-3.5 pt-1'
      } ${className}`}
    >
      <legend
        className={`w-auto font-medium uppercase tracking-wider text-ink-300 ${
          compact ? 'px-1.5 text-[11px]' : 'px-2 text-xs'
        } ${align === 'center' ? 'mx-auto text-center' : ''}`}
      >
        {label}
        {required ? <span className="text-red-300"> *</span> : null}
      </legend>
      {children}
    </fieldset>
  )
}
