import Link from 'next/link'
import { DownloadButton } from '@/components/download/DownloadButton'
import { Planet } from '@/components/space/Planet'
import { buttonClass } from '@/components/ui/button'
import type { Release } from '@/lib/releases'

/** The first screen, as Orbit's splash: the logo above a planet's horizon,
 * under the page's sky of sparkles and meteors. */
export function Hero({ latest }: { latest: Release | undefined }) {
  return (
    <section className="relative isolate flex min-h-[100svh] flex-col items-center overflow-hidden px-6 pb-[24svh] pt-32 text-center sm:pt-36">
      <Planet />
      <div className="relative flex flex-1 flex-col items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- brand mark, painted at once */}
        <img
          src="/assets/orbit-logo.png"
          alt="Orbit"
          className="float-soft h-auto w-[min(300px,62vw)] drop-shadow-[0_12px_30px_rgb(0_0_0/0.55)]"
        />
        <h1 className="mx-auto mt-8 max-w-5xl text-[clamp(2.8rem,7vw,6.5rem)] font-medium leading-[0.92] tracking-[-0.06em]">
          Every game.
          <br />
          <span className="fire-text">One orbit.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
          The controller-first game launcher for your Mac. Steam, Windows games through
          Orbit Wine and Apple&apos;s Game Porting Toolkit, and your Mac apps, in one
          beautiful library.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <DownloadButton release={latest} />
          <Link
            href="/docs"
            className={buttonClass({ variant: 'secondary', size: 'lg' })}
          >
            See how Orbit works <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
          Free and open source · Apple silicon · macOS 12+ · Local by default
        </p>
      </div>
    </section>
  )
}
