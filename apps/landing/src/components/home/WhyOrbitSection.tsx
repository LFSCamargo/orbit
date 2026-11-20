import { GlassPanel } from '@/components/ui/glass-panel'
import { Reveal } from '@/components/ui/reveal'

const ROWS = [
  { label: 'Price', orbit: 'Free, forever', typical: 'Free tier, paid extras' },
  { label: 'Source code', orbit: 'Open source on GitHub', typical: 'Closed' },
  { label: 'Account', orbit: 'None needed', typical: 'Required to start' },
  { label: 'Your data', orbit: 'Stays on your Mac', typical: 'Synced to their cloud' },
  { label: 'Ads and tracking', orbit: 'None', typical: 'Common' },
  { label: 'Made for', orbit: 'The Mac and the couch', typical: 'A phone port' },
]

/** What Orbit promises, side by side with what launchers usually ask for. */
export function WhyOrbitSection() {
  return (
    <section id="why" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-24 sm:py-32">
      <Reveal>
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
            05 — Why Orbit
          </p>
          <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
            Your games. <span className="fire-text">Your rules.</span>
          </h2>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <GlassPanel className="mt-14 overflow-hidden p-2 sm:p-3">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                <th scope="col" className="px-4 py-4 font-normal sm:px-6">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col" className="px-4 py-4 font-normal text-orange-300 sm:px-6">
                  Orbit
                </th>
                <th scope="col" className="px-4 py-4 font-normal sm:px-6">
                  Typical launcher
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-white/[0.08]">
                  <th scope="row" className="px-4 py-4 font-normal text-white/65 sm:px-6">
                    {row.label}
                  </th>
                  <td className="rounded-xl bg-orange-500/[0.06] px-4 py-4 font-medium sm:px-6">
                    {row.orbit}
                  </td>
                  <td className="px-4 py-4 text-white/50 sm:px-6">{row.typical}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      </Reveal>
    </section>
  )
}
