import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { NativeGlassPanel } from '@/components/home/NativeGlassPanel'

interface Ps5GlassChipProps {
  imageSrc: string | null
  className?: string
  contentClassName?: string
  children: ReactNode
}

/** Small frosted PS5 pill / icon chip using the native glass bitmap recipe. */
export function Ps5GlassChip({
  imageSrc,
  className,
  contentClassName,
  children,
}: Ps5GlassChipProps) {
  return (
    <NativeGlassPanel
      imageSrc={imageSrc}
      variant="ps5"
      blurPlacement="center"
      className={clsx('ps5-glass-chip overflow-hidden', className)}
      contentClassName={contentClassName}
    >
      {children}
    </NativeGlassPanel>
  )
}
