import type { ReactNode } from 'react'
import { SteamLogo } from '@/components/brand/SteamLogo'
import { XboxLogo } from '@/components/brand/XboxLogo'
import { AppleIcon } from '@/components/download/AppleIcon'
import { SourceCard } from '@/components/home/SourceCard'
import { Reveal } from '@/components/ui/reveal'

const SOURCES: { name: string; logo: ReactNode; detail: string }[] = [
  {
    name: 'Steam',
    logo: <SteamLogo className="h-6 w-6" />,
    detail: 'Your Steam library comes in as it is, Mac and Windows games alike.',
  },
  {
    name: 'Windows games',
    // eslint-disable-next-line @next/next/no-img-element -- static brand mark
    logo: <img src="/assets/orbit-app-icon.png" alt="" className="h-6 w-6" />,
    detail: 'Installers and folders run in Orbit Wine, one container per game.',
  },
  {
    name: 'Mac apps',
    logo: <AppleIcon className="h-6 w-6" />,
    detail: 'Native games and apps from your Mac, with artwork you can fetch or edit.',
  },
  {
    name: 'Xbox Cloud Gaming',
    logo: <XboxLogo className="h-6 w-6 text-white" />,
    detail: 'Browse the catalog and stream in Orbit’s own player with your Game Pass.',
  },
]

/** Where Orbit's library comes from, drawn as bodies around the Orbit mark. */
export function SourcesSection() {
  return (
    <section id="sources" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 sm:py-32">
      <Reveal>
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
            02 — Your sources
          </p>
          <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
            Four worlds. <span className="fire-text">One launcher.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/65">
            Orbit pulls in what you already have and launches each game the right way, so
            you never need to remember where something came from.
          </p>
        </div>
      </Reveal>

      <div className="mt-16 grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {SOURCES.slice(0, 2).map((source, index) => (
            <SourceCard key={source.name} {...source} delay={index * 0.06} />
          ))}
        </ul>
        <Reveal delay={0.1} className="order-first lg:order-none">
          <div
            aria-hidden="true"
            className="relative mx-auto grid h-64 w-64 place-items-center sm:h-80 sm:w-80"
          >
            <span className="absolute inset-0 rounded-full border border-white/10" />
            <span className="absolute inset-8 rounded-full border border-dashed border-orange-500/25" />
            <span className="orbit-spin absolute inset-0">
              <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-400 shadow-[0_0_18px_rgb(255_140_60)]" />
            </span>
            <span className="orbit-spin-slow absolute inset-8">
              <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/80" />
            </span>
            <span className="absolute inset-16 rounded-full bg-orange-500/20 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img
              src="/assets/orbit-app-icon.png"
              alt=""
              className="relative h-24 w-24 sm:h-28 sm:w-28"
            />
          </div>
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {SOURCES.slice(2).map((source, index) => (
            <SourceCard key={source.name} {...source} delay={0.12 + index * 0.06} />
          ))}
        </ul>
      </div>
    </section>
  )
}
