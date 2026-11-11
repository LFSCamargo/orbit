import Link from 'next/link'
import { DownloadButton } from '@/components/download/DownloadButton'
import { PlatformIcon } from '@/components/download/PlatformIcon'
import { GlassCard } from '@/components/ui/glass-card'
import { Reveal } from '@/components/ui/reveal'
import type { AssetPlatform, Release } from '@/lib/releases'

const PLATFORMS: Array<{
  id: AssetPlatform
  name: string
  detail: string
}> = [
  { id: 'macos', name: 'macOS', detail: 'Apple Silicon · macOS 12+' },
  { id: 'windows', name: 'Windows', detail: 'Installer and portable builds' },
  { id: 'linux', name: 'Linux', detail: 'AppImage, DEB, and RPM' },
]

export function DownloadPlatforms({ latest }: { latest: Release | undefined }) {
  return (
    <section
      id="download"
      className="scroll-mt-24 border-y border-orbit-border bg-white/[0.015]"
    >
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
                04 — Download
              </p>
              <h2 className="mt-5 max-w-2xl text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
                Press start on any desktop.
              </h2>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-sm text-sm leading-6 text-orbit-muted">
              Free and open source. Choose your platform, then point Orbit at the games
              you already own.
            </p>
          </Reveal>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PLATFORMS.map((platform, index) => (
            <Reveal key={platform.id} delay={index * 0.08}>
              <GlassCard
                radius={28}
                className="group flex h-full min-h-72 flex-col p-7 transition duration-300 hover:-translate-y-1 hover:border-orange-500/40"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-orbit-foreground transition group-hover:text-orbit-accent">
                    <PlatformIcon platform={platform.id} />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-orbit-muted">
                    Desktop
                  </span>
                </div>
                <h3 className="mt-8 text-2xl font-medium">{platform.name}</h3>
                <p className="mt-2 text-sm text-orbit-muted">{platform.detail}</p>
                <div className="mt-auto flex flex-col items-stretch gap-3 pt-8">
                  <DownloadButton release={latest} platform={platform.id} compact />
                  <Link
                    href={`/install#${platform.id}`}
                    className="text-center text-xs text-orbit-muted transition hover:text-orbit-foreground"
                  >
                    Installation guide →
                  </Link>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
