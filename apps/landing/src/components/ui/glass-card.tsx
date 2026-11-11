import { type HTMLAttributes, type ReactNode } from 'react'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { cn } from '@/lib/utils'

export type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  radius?: number
}

export function GlassCard({
  children,
  className,
  radius = 28,
  ...props
}: GlassCardProps) {
  return (
    <LiquidGlass
      radius={radius}
      className={cn('border border-white/[0.08] bg-neutral-900/45', className)}
      tint={0.08}
      {...props}
    >
      {children}
    </LiquidGlass>
  )
}
