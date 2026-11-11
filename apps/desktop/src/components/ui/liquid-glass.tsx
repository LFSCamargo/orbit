import type { HTMLAttributes } from 'react'
import { clsx } from 'clsx'
import { useReducedTransparency } from '@/hooks/useReducedTransparency'
import './liquid-glass.css'

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string
  radius?: number
  surface?: 'toolbar' | 'panel'
}

/** Shared compositor surface using the Rust-prepared material when available. */
export function LiquidGlass({
  children,
  className,
  contentClassName,
  radius = 24,
  surface = 'panel',
  style,
  ...rest
}: LiquidGlassProps) {
  const opaque = useReducedTransparency()
  return (
    <div
      className={clsx('orbit-glass relative overflow-hidden', className)}
      data-glass-mode={opaque ? 'opaque' : 'simple'}
      data-glass-surface={surface}
      data-refract="false"
      style={{
        borderRadius: radius,
        ...style,
        ...(opaque ? { backdropFilter: 'none', WebkitBackdropFilter: 'none' } : {}),
      }}
      {...rest}
    >
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </div>
  )
}
