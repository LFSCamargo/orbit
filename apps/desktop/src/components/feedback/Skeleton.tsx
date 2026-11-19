import type { CSSProperties } from 'react'
import { clsx } from 'clsx'

/** A soft block with the artwork loader's shimmer sweep. */
export function SkeletonBlock({
  className,
  style,
}: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      data-skeleton
      style={style}
      className={clsx(
        'relative block overflow-hidden bg-orbit-foreground/[0.06]',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-artwork-shimmer after:bg-[linear-gradient(100deg,transparent_15%,rgb(255_255_255/0.1)_48%,transparent_80%)] after:content-[""]',
        'motion-reduce:after:translate-x-0 motion-reduce:after:animate-none motion-reduce:after:opacity-35',
        className,
      )}
    />
  )
}

/** Placeholder rows for a settings card or list that is still loading: an
 * icon, a title line and a shorter detail line each. No visible text; the
 * label names it for assistive tech. */
export function SkeletonPanel({
  label,
  rows = 3,
  className,
}: {
  label: string
  rows?: number
  className?: string
}) {
  return (
    <div role="status" aria-label={label} className={clsx('grid gap-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <SkeletonBlock className="size-9 shrink-0 rounded-[12px]" />
          <div className="grid flex-1 gap-2">
            <SkeletonBlock className="h-3.5 w-2/5 rounded-full" />
            <SkeletonBlock className="h-3 w-3/4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
