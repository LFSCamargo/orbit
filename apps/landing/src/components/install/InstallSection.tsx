import type { ReactNode } from 'react'

interface InstallSectionProps {
  id: string
  title: string
  step?: number
  children: ReactNode
}

export function InstallSection({ id, title, step, children }: InstallSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="flex items-center gap-3 text-2xl font-bold">
        {step !== undefined && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orbit-accent text-base text-orbit-canvas">
            {step}
          </span>
        )}
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-orbit-muted">{children}</div>
    </section>
  )
}
