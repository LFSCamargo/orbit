import Link from 'next/link'
import { DownloadButton } from '@/components/download/DownloadButton'
import { Meteors } from '@/components/space/Meteors'
import { buttonClass } from '@/components/ui/button'
import { DownloadIcon } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/reveal'
import type { Release } from '@/lib/releases'
import { InstallAnimation } from './InstallAnimation'

const REQUIREMENTS = [
  'Apple silicon',
  'macOS 12 Monterey or later',
  'Free and open source',
]

/** The install page's own first screen: the promise, the download, and the
 * install playing out beside it. */
export function InstallHero({
  latest,
  version,
}: {
  latest: Release | undefined
  version: string
}) {
  return (
    <section className="relative isolate overflow-hidden px-6 pb-20 pt-36 sm:pt-44">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
      >
        <div className="absolute inset-x-0 top-0 h-[70%] overflow-hidden opacity-70">
          <Meteors count={10} />
        </div>
        <div className="glow-breathe absolute -bottom-28 left-1/2 h-96 w-[150%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_120_50/0.3),rgb(255_80_30/0.08)_55%,transparent_75%)]" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <Reveal>
          <p className="orbit-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-orbit-accent">
            <DownloadIcon className="h-4 w-4" />
            Installation{latest ? ` · v${latest.version}` : ''}
          </p>
          <h1 className="mt-6 text-[clamp(2.6rem,5.2vw,4.6rem)] font-medium leading-[0.95] tracking-[-0.055em]">
            Get Orbit running
            <br />
            <span className="fire-text">in minutes.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
            Download, set up, and launch games on Mac in a few simple steps. The first
            launch prepares everything Windows games need.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <DownloadButton release={latest} />
            <Link
              href="/download"
              className={buttonClass({ variant: 'secondary', size: 'lg' })}
            >
              All releases
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-2" aria-label="Requirements">
            {REQUIREMENTS.map((item) => (
              <li
                key={item}
                className="rounded-full border border-white/[0.12] bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60"
              >
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.15} direction="left">
          <InstallAnimation version={version} />
        </Reveal>
      </div>
    </section>
  )
}
