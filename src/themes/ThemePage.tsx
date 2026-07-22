import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { useThemeLayout } from '@/themes/useThemeLayout'

interface ThemePageProps {
  title: string
  subtitle?: string
  eyebrow?: string
  children: ReactNode
  className?: string
}

export function ThemePage({ title, subtitle, eyebrow, children, className }: ThemePageProps) {
  const layout = useThemeLayout()

  if (layout === 'switch') {
    return (
      <div className={clsx('flex min-h-full flex-1 flex-col px-8 py-4', className)}>
        <header className="mb-5 shrink-0 border-b border-[var(--switch-border)] pb-4">
          <h1 className="text-[1.65rem] font-normal text-[var(--switch-cyan)]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--switch-muted)]">{subtitle}</p>}
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    )
  }

  if (layout === 'ps5') {
    return (
      <div className={clsx('flex min-h-full flex-1 flex-col px-8 py-4', className)}>
        <header className="mb-5 shrink-0 border-b border-[var(--ps5-border)] pb-4">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--ps5-muted)]">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ps5-ink)]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--ps5-muted)]">{subtitle}</p>}
        </header>
        <div className="min-h-0 flex-1 rounded-2xl bg-[var(--ps5-panel)] p-6 ring-1 ring-white/10">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('orbit-route min-h-screen bg-transparent px-10 pb-16 pt-2 text-white', className)}>
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-white/50">{subtitle}</p>}
      </header>
      {children}
    </div>
  )
}
