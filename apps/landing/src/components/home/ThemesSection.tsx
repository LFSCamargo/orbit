import Link from 'next/link'
import { GlassCard } from '@/components/ui/glass-card'
import { Reveal } from '@/components/ui/reveal'

const SWATCHES = [
  'from-red-500 to-orange-400',
  'from-orange-400 to-yellow-300',
  'from-zinc-500 to-zinc-800',
]

export function ThemesSection() {
  return (
    <section className="border-y border-orbit-border bg-white/[0.015]">
      <div className="mx-auto grid max-w-7xl gap-14 px-6 py-24 sm:py-32 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
              02 — Make it yours
            </p>
            <h2 className="mt-5 max-w-xl text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              A front end with your signature.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-orbit-muted">
              Start with a console-inspired shell, then tune the color, motion, wallpaper,
              logo, and per-game accents. The built-in studio turns plain JSON into a home
              screen that feels unmistakably yours.
            </p>
            <Link
              href="/docs#themes"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-orbit-accent hover:text-orbit-focus"
            >
              Explore themes and customization <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <GlassCard
            radius={28}
            className="relative min-h-[26rem] overflow-hidden p-6 sm:p-8"
          >
            <div className="orbit-grid absolute inset-0 opacity-60" />
            <div className="relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 p-6">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                <span>Orbit / Theme studio</span>
                <span className="text-orange-400">Live preview</span>
              </div>
              <div className="my-auto">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  Now playing
                </p>
                <p className="mt-3 bg-gradient-to-r from-red-500 via-orange-400 to-yellow-300 bg-clip-text text-5xl font-medium tracking-[-0.06em] text-transparent">
                  Arcade
                  <br />
                  after dark.
                </p>
              </div>
              <div className="space-y-3">
                {SWATCHES.map((swatch, index) => (
                  <div key={swatch} className="flex items-center gap-3">
                    <span
                      className={`h-2 flex-1 rounded-full bg-gradient-to-r ${swatch}`}
                    />
                    <span className="w-8 font-mono text-[10px] text-zinc-500">
                      0{index + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  )
}
