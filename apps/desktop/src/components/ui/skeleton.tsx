// Adapted from shadcn/ui Skeleton (MIT), using Orbit surface tokens.
import type { HTMLAttributes } from 'react'
import { clsx } from 'clsx'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'animate-pulse rounded-card bg-orbit-muted/15 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}
