import type { ReactNode } from 'react'
import { Meteors } from '@/components/space/Meteors'
import { Reveal } from '@/components/ui/reveal'

interface PageHeroProps {
  eyebrow: string
  icon: ReactNode
  /** The plain part of the title, then the part in Orbit's fire. */
  title: string
  highlight: string
  description: ReactNode
  children?: ReactNode
}

/** The top of a Resources page: an eyebrow pill, a two-tone title and a
 * horizon glow, matching the page's social card. */
export function PageHero({
  eyebrow,
  icon,
  title,
  highlight,
  description,
  children,
}: PageHeroProps) {
  return (
    <section className="relative isolate overflow-hidden px-6 pb-16 pt-36 sm:pb-20 sm:pt-44">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
      >
        <div className="absolute inset-x-0 top-0 h-[70%] overflow-hidden opacity-70">
          <Meteors count={8} />
        </div>
        <div className="glow-breathe absolute -bottom-24 left-1/2 h-80 w-[140%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_120_50/0.24),rgb(255_80_30/0.07)_55%,transparent_75%)]" />
      </div>
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="orbit-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-orbit-accent">
            <span className="text-orbit-accent">{icon}</span>
            {eyebrow}
          </p>
          <h1 className="mt-6 max-w-4xl text-[clamp(2.6rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.05em]">
            {title} <span className="fire-text whitespace-nowrap">{highlight}</span>
          </h1>
          <div className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
            {description}
          </div>
          {children}
        </Reveal>
      </div>
    </section>
  )
}
