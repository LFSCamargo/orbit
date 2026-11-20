import Link from 'next/link'
import { EpicLogo } from '@/components/brand/EpicLogo'
import { SteamLogo } from '@/components/brand/SteamLogo'
import { XboxLogo } from '@/components/brand/XboxLogo'
import { AppleIcon } from '@/components/download/AppleIcon'
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
          className="float-soft h-auto w-[min(240px,52vw)] drop-shadow-[0_12px_30px_rgb(0_0_0/0.55)]"
        />
        <h1 className="mx-auto mt-7 max-w-5xl text-[clamp(2.3rem,5.4vw,5rem)] font-medium leading-[0.95] tracking-[-0.055em]">
          Every game.
          <br />
          <span className="fire-text">One orbit.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-white/70 sm:text-base">
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
        <ul
          aria-label="Plays games from"
          className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm text-white/75"
        >
          <li className="flex items-center gap-2">
            <SteamLogo className="h-5 w-5" /> Steam
          </li>
          <li className="flex items-center gap-2">
            <XboxLogo className="h-5 w-5 text-white" /> Xbox Cloud Gaming
          </li>
          <li className="flex items-center gap-2">
            <AppleIcon className="h-5 w-5" /> Mac games
          </li>
          <li className="flex items-center gap-2 text-white/50">
            <EpicLogo className="h-5 w-auto opacity-80" /> Epic Games
            <span className="rounded-full border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
              Soon
            </span>
          </li>
        </ul>
      </div>
    </section>
  )
}
