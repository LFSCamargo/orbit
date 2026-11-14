import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { LiquidGlass } from './liquid-glass'

/** Shared pill surface for route tabs; children retain their controller focus IDs. */
export function TabList({
  label,
  children,
  className,
  role = 'tablist',
}: {
  label: string
  children: ReactNode
  className?: string
  role?: 'tablist' | 'group'
}) {
  return (
    <LiquidGlass
      surface="toolbar"
      radius={999}
      role={role}
      aria-label={label}
      className={clsx(
        'orbit-tabs inline-flex max-w-full flex-wrap gap-1 p-[5px]',
        '[&>button]:inline-flex [&>button]:min-h-11 [&>button]:items-center [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:rounded-[999px] [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-5 [&>button]:text-[13px] [&>button]:font-[550] [&>button]:text-orbit-foreground/80',
        '[&>button[aria-selected=true]]:bg-[linear-gradient(#ffffff24,#ffffff15)] [&>button[aria-selected=true]]:text-orbit-foreground [&>button[aria-selected=true]]:shadow-[inset_0_1px_0_#ffffff1a]',
        '[&>button[aria-pressed=true]]:bg-[linear-gradient(#ffffff24,#ffffff15)] [&>button[aria-pressed=true]]:text-orbit-foreground [&>button[aria-pressed=true]]:shadow-[inset_0_1px_0_#ffffff1a]',
        '[&>button:hover]:text-orbit-foreground',
        className,
      )}
    >
      {children}
    </LiquidGlass>
  )
}
