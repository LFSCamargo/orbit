import type { ReactNode } from 'react'
import { SECTION_TITLE } from './styles'

/** A sidebar section's title, optional count and one-line description. */
export function SectionHeading({
  title,
  count,
  description,
  action,
}: {
  title: string
  count?: number
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className={SECTION_TITLE}>
          {title}
          {count ? ` (${count})` : ''}
        </h3>
        <p className="m-0 mt-0.5 text-[12px] leading-snug text-white/55">{description}</p>
      </div>
      {action}
    </div>
  )
}
