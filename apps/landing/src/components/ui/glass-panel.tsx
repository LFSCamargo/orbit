import type { ElementType, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Orbit's liquid glass panel (the app's onboarding panel): a near-clear tint
 * over a light lens blur, a bright rim and light pooling inside the top edge.
 * The material lives in globals.css (`.orbit-glass`). */
export function GlassPanel({
  as: Tag = 'div',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return <Tag className={cn('orbit-glass rounded-[24px]', className)} {...props} />
}
