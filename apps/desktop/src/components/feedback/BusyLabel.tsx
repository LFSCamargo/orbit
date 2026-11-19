import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Spinner } from './Spinner'

/** A button label that stays the same while its action runs: the text dims
 * and a spinner takes the lead, so the button neither changes width nor
 * swaps to "Saving…" style text. */
export function BusyLabel({
  busy,
  children,
  className,
}: {
  busy: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-busy={busy}
      className={clsx('inline-flex items-center justify-center gap-2', className)}
    >
      {busy && <Spinner size={15} />}
      <span className={clsx('transition-opacity', busy && 'opacity-70')}>{children}</span>
    </span>
  )
}
