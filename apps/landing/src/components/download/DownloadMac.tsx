import Link from 'next/link'
import { GlassPanel } from '@/components/ui/glass-panel'
import { Reveal } from '@/components/ui/reveal'
import type { Release } from '@/lib/releases'
import { AppleIcon } from './AppleIcon'
import { DownloadButton } from './DownloadButton'

const REQUIREMENTS = [
  'A Mac with Apple silicon (M1 or later)',
  'macOS 12 Monterey or later',
  'Rosetta 2 for Windows games (macOS offers it on first launch)',
  'A controller is optional: keyboard and mouse work everywhere',
]

/** The home page's download panel: Orbit is a Mac app. */
export function DownloadMac({ latest }: { latest: Release | undefined }) {
  return (
    <section id="download" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 sm:py-32">
      <Reveal>
        <GlassPanel className="relative overflow-hidden rounded-[32px] p-8 sm:p-12">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-[90px]" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
                04 — Download
              </p>
              <h2 className="mt-5 max-w-2xl text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
                Press start on <span className="fire-text">your Mac.</span>
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/65">
                Free and open source. Download Orbit, and its first launch sets up Orbit
                Wine, finds your games and signs you in to Steam.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <DownloadButton release={latest} />
                <Link
                  href="/install"
                  className="text-sm text-white/70 transition hover:text-white"
                >
                  Installation guide →
                </Link>
              </div>
            </div>
            <GlassPanel className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                  <AppleIcon className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-lg font-medium">Orbit for Mac</h3>
                  <p className="text-xs text-white/55">What you need</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm text-white/70">
                {REQUIREMENTS.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--orbit-fire-via))]" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/download"
                className="mt-6 inline-block text-xs text-white/55 transition hover:text-white"
              >
                All releases and checksums →
              </Link>
            </GlassPanel>
          </div>
        </GlassPanel>
      </Reveal>
    </section>
  )
}
