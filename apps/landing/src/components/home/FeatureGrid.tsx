import { GlassCard } from '@/components/ui/glass-card'
import { Reveal } from '@/components/ui/reveal'

const FEATURES = [
  {
    number: '01',
    title: 'Everything you own, together',
    body: 'Bring Steam, Astris, GameHub, native apps, and manual game paths into one fast, searchable library. No migrating your collection and no new store.',
    wide: true,
  },
  {
    number: '02',
    title: 'Built for the couch',
    body: 'Spatial navigation, clear focus, and full controller support. Keyboard controls are always there too.',
  },
  {
    number: '03',
    title: 'Your local library',
    body: 'Games, artwork, settings, and playtime stay in a local SQLite database on your machine.',
  },
  {
    number: '04',
    title: 'Artwork that feels cinematic',
    body: 'Shape every game page with covers, heroes, icons, descriptions, and metadata from optional artwork providers.',
  },
  {
    number: '05',
    title: 'Launch. Play. Done.',
    body: 'Orbit starts the game, tracks the session, and steps out of the way. When you come back, your library is right where you left it.',
    wide: true,
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 sm:py-32">
      <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
        <Reveal>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
              01 — The launcher
            </p>
            <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              Less managing.
              <br />
              More playing.
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="max-w-xl text-base leading-7 text-orbit-muted md:justify-self-end">
            Orbit is not another store, emulator, or cloud service. It is a calm,
            beautiful control center for the games already on your computer.
          </p>
        </Reveal>
      </div>
      <ul className="mt-14 grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal
            key={feature.number}
            delay={index * 0.05}
            className={feature.wide ? 'md:col-span-2' : ''}
          >
            <GlassCard
              radius={28}
              className="group relative h-full overflow-hidden p-7 transition duration-300 hover:border-white/20 sm:p-8"
            >
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/0 blur-3xl transition duration-500 group-hover:bg-orange-500/10" />
              <span className="font-mono text-xs text-orbit-accent">
                {feature.number}
              </span>
              <h3 className="mt-10 max-w-md text-2xl font-medium tracking-[-0.025em]">
                {feature.title}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-6 text-orbit-muted">
                {feature.body}
              </p>
            </GlassCard>
          </Reveal>
        ))}
        <Reveal delay={0.25}>
          <div className="flex h-full min-h-64 flex-col justify-between rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/15 via-red-950/10 to-transparent p-8">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-orange-300">
              No account required
            </span>
            <p className="text-3xl font-medium leading-tight tracking-[-0.04em]">
              Open the app.
              <br />
              Own the experience.
            </p>
          </div>
        </Reveal>
      </ul>
    </section>
  )
}
