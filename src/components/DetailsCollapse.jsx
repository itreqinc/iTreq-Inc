import { Children, isValidElement, useRef } from 'react'
import {
  COLLAPSE_BODY_CLASS,
  useDetailsIntoView,
} from '../lib/collapseIntoView'

/**
 * Native <details> that scrolls into view on open and caps body height to the viewport.
 */
export function DetailsCollapse({ className = '', bodyClassName = '', children, ...rest }) {
  const ref = useRef(null)
  useDetailsIntoView(ref)

  const childArr = Children.toArray(children)
  const summary = childArr.find((c) => isValidElement(c) && c.type === 'summary')
  const body = childArr.filter((c) => !(isValidElement(c) && c.type === 'summary'))

  return (
    <details ref={ref} className={className} {...rest}>
      {summary}
      <div className={`${COLLAPSE_BODY_CLASS} ${bodyClassName}`.trim()}>{body}</div>
    </details>
  )
}

