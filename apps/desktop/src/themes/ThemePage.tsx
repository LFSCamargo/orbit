import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface ThemePageProps {
  /** Retained for call-site compatibility; page chrome is owned by the shell. */
  title: string
  subtitle?: string
  eyebrow?: string
  children: ReactNode
  className?: string
}

export function ThemePage({ children, className }: ThemePageProps) {
  return (
    <section
      className={clsx(
        'macos-page relative min-w-0 px-[var(--console-gutter)] pt-6',
        className ?? 'pb-16',
      )}
    >
      {children}
    </section>
  )
}
