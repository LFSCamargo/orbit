import Image from 'next/image'
import { DownloadButton } from '@/components/download/DownloadButton'
import { DocsCta } from '@/components/home/DocsCta'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { Spotlight } from '@/components/ui/spotlight-new'
import { TextGenerateEffect } from '@/components/ui/text-generate-effect'
import type { Release } from '@/lib/releases'

export function Hero({ latest }: { latest: Release | undefined }) {
  return (
    <div className="relative overflow-hidden pt-28">
      <Spotlight />
      <div className="orbit-grid pointer-events-none absolute inset-x-0 top-0 h-[52rem] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[60rem] -translate-x-1/2 rounded-full bg-orange-600/10 blur-[140px]" />

      <section className="relative mx-auto max-w-7xl px-6 pb-16 pt-12 text-center sm:pb-24 sm:pt-20">
        <LiquidGlass
          radius={999}
          className="mx-auto mb-8 inline-flex items-center gap-2.5 px-4 py-2"
          tint={0.08}
        >
          <Image
            src="/assets/orbit-icon.png"
            alt=""
            width={20}
            height={20}
            className="rounded-md"
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-orbit-muted">
            Your games. Your machine. Your Orbit.
          </span>
        </LiquidGlass>

        <h1 className="mx-auto mt-2 max-w-5xl text-[clamp(3.5rem,8vw,7.5rem)] font-medium leading-[0.9] tracking-[-0.065em]">
          Every game.
          <br />
          <span className="bg-gradient-to-r from-red-500 via-orange-400 to-yellow-300 bg-clip-text text-transparent">
            One orbit.
          </span>
        </h1>

        <TextGenerateEffect
          words="A controller-first home for your entire game library. Import what you own, make it beautiful, and get from the couch to playing in seconds."
          className="mx-auto mt-8 max-w-2xl text-base leading-7 text-orbit-muted sm:text-lg"
          filter={false}
        />

        <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
          <DownloadButton release={latest} />
          <DocsCta>
            See how Orbit works <span aria-hidden="true">→</span>
          </DocsCta>
        </div>

        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-orbit-muted">
          Open source · macOS · Windows · Linux · Local by default
        </p>
      </section>
    </div>
  )
}
