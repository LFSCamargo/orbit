import { cn } from '@/lib/utils'

/** Buttons as in the Orbit app (apps/desktop/src/components/ui/button.tsx):
 * the primary carries the fire gradient as liquid glass with a white label;
 * the secondary is a clear glass pill. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg'
  className?: string
} = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition focus-visible:outline-none',
    size === 'lg' ? 'min-h-[56px] px-8 text-base' : 'min-h-[44px] px-5 text-sm',
    variant === 'primary'
      ? 'orbit-btn-fire'
      : 'orbit-glass text-white/90 hover:text-white hover:brightness-110',
    className,
  )
}
