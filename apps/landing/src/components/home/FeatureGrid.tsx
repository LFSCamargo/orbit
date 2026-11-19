import { GlassPanel } from '@/components/ui/glass-panel'
import { Reveal } from '@/components/ui/reveal'

const FEATURES = [
  {
    number: '01',
    title: 'Everything you own, together',
    body: 'Steam, Windows games and Mac apps in one fast, searchable library, with artwork, playtime and where each game comes from. No migrating your collection and no new store.',
    wide: true,
  },
  {
    number: '02',
    title: 'Windows games on your Mac',
    body: 'Orbit Wine runs each game in its own container, with MSync, D3DMetal from Game Porting Toolkit, DXMT and DXVK set up and kept current for you.',
  },
  {
    number: '03',
    title: 'Tuned for Apple silicon',
    body: 'Recommended performance settings out of the box, and macOS Game Mode for every game Orbit starts.',
  },
  {
    number: '04',
    title: 'Built for the couch',
    body: 'Spatial navigation, a clear focus ring and full controller support, Bluetooth and USB, passed straight to your games.',
  },
  {
    number: '05',
    title: 'Launch. Play. Done.',
    body: 'Orbit starts the game, tracks the session and steps out of the way. Your library, artwork and settings stay on your Mac.',
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
              <span className="fire-text">More playing.</span>
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="max-w-xl text-base leading-7 text-white/65 md:justify-self-end">
            Orbit is not another store, emulator, or cloud service. It is a calm,
            beautiful control center for the games already on your Mac, and the easiest
            way to play your Windows games there.
          </p>
        </Reveal>
      </div>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal
            key={feature.number}
            delay={index * 0.05}
            className={feature.wide ? 'md:col-span-2' : ''}
          >
            <GlassPanel className="group relative h-full overflow-hidden p-7 transition duration-300 hover:-translate-y-0.5 sm:p-8">
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/0 blur-3xl transition duration-500 group-hover:bg-orange-500/15" />
              <span className="font-mono text-xs text-orbit-accent">
                {feature.number}
              </span>
              <h3 className="mt-10 max-w-md text-2xl font-medium tracking-[-0.025em]">
                {feature.title}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">
                {feature.body}
              </p>
            </GlassPanel>
          </Reveal>
        ))}
        <Reveal delay={0.25}>
          <div className="flex h-full min-h-64 flex-col justify-between rounded-[24px] border border-orange-500/25 bg-gradient-to-br from-orange-500/20 via-red-950/15 to-transparent p-8 backdrop-blur-sm">
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
      </div>
    </section>
  )
}
