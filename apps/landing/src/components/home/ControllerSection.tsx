import { GlassCard } from '@/components/ui/glass-card'
import { Reveal } from '@/components/ui/reveal'

const MAPPING = [
  { button: 'D-pad / stick', action: 'Navigate' },
  { button: 'A', action: 'Select' },
  { button: 'B', action: 'Back' },
  { button: 'X', action: 'Edit' },
  { button: 'Y', action: 'Add game' },
  { button: 'L1 / R1', action: 'Sections' },
  { button: 'Menu', action: 'Settings' },
]

export function ControllerSection() {
  return (
    <section className="mx-auto grid max-w-7xl gap-14 px-6 py-24 sm:py-32 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <Reveal>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
            03 — Controller first
          </p>
          <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
            Pick up the controller. Leave the desk.
          </h2>
          <p className="mt-6 max-w-lg text-base leading-7 text-orbit-muted">
            Every screen is designed around predictable spatial focus. Move through your
            library, edit artwork, change themes, and launch a game without reaching for a
            mouse.
          </p>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-orbit-muted">
            Keyboard: arrows · Enter · Esc · F · C · [ ] · M
          </p>
        </div>
      </Reveal>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MAPPING.map((entry, index) => (
          <Reveal key={entry.button} delay={index * 0.04}>
            <GlassCard
              radius={20}
              className="h-full p-5 transition hover:border-orange-500/30"
            >
              <dt className="font-mono text-xs font-medium text-orbit-foreground">
                {entry.button}
              </dt>
              <dd className="mt-3 text-sm text-orbit-muted">{entry.action}</dd>
            </GlassCard>
          </Reveal>
        ))}
        <Reveal delay={0.3}>
          <div className="hidden h-full items-center justify-center rounded-2xl border border-dashed border-orange-500/25 bg-orange-500/[0.04] p-5 text-center font-mono text-[10px] uppercase tracking-widest text-orange-300 sm:flex">
            Ready player one
          </div>
        </Reveal>
      </dl>
    </section>
  )
}
