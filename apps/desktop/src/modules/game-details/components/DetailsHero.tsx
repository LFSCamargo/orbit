import { useLayoutEffect, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { gameHeroImage, gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { cssUrl, mediaSrc } from '@/lib/media'
import { providerLabel } from '@/lib/format'
import type { Game } from '@/types/game'

const platforms: Record<Game['platform'], string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  'nintendo-switch': 'Nintendo Switch',
  cloud: 'Xbox Cloud Gaming',
  unknown: 'Platform not specified',
}
export function DetailsHero({
  game,
  eyebrow = 'IN YOUR COLLECTION',
  children,
  aside,
}: {
  game: Game
  eyebrow?: string
  children?: ReactNode
  /** Shown to the right of the command bar, e.g. download status. */
  aside?: ReactNode
}) {
  const reduce = useReducedMotion()
  const theme = useActiveTheme()
  const heroRaw = gameHeroImage(game.artwork) ?? theme.branding?.wallpaper
  const hero = heroRaw ? mediaSrc(heroRaw) : undefined
  const cover = gameTileImage(game.artwork, 'portrait')
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('[data-macos-shell]')
    if (!shell) return
    shell.style.setProperty(
      '--macos-details-image',
      hero ? cssUrl(hero) : artworkPlaceholder(game.id),
    )
    shell.dataset.detailsArtwork = 'true'
    return () => {
      shell.style.removeProperty('--macos-details-image')
      delete shell.dataset.detailsArtwork
    }
  }, [game.id, hero])
  return (
    <section
      className="details-hero relative isolate min-h-[clamp(360px,46vh,630px)] overflow-visible"
      aria-labelledby="details-title"
    >
      <div
        className="details-hero-art hidden"
        aria-hidden
        style={{ backgroundImage: hero ? cssUrl(hero) : artworkPlaceholder(game.id) }}
      />
      <div className="details-hero-shade hidden" aria-hidden />
      <motion.div
        className={clsx(
          'details-hero-content flex min-h-[inherit] items-center justify-between gap-12 px-[var(--console-gutter)] pb-[60px] pt-6',
          'min-[761px]:max-[1000px]:gap-[30px]',
          'max-[760px]:gap-5',
          'max-[520px]:px-[22px]',
        )}
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4 }}
      >
        <div className="details-identity min-w-0 max-w-[780px] max-[520px]:max-w-full">
          <p className="details-eyebrow text-[9px] font-[650] tracking-[0.2em] text-orbit-accent">
            {eyebrow}
          </p>
          <div className="details-source mt-[22px] flex flex-wrap items-center gap-3 max-[520px]:mt-[18px] max-[520px]:gap-[9px]">
            <ProviderBadge
              provider={game.provider}
              className="px-[9px] py-[5px] text-[8px] tracking-[0.1em]"
            />
            <span className="text-[10px] text-white/50">{platforms[game.platform]}</span>
            {game.hidden && (
              <span className="details-hidden-label rounded-md border border-white/[0.145] px-[7px] py-1 text-[10px] text-white/50">
                Hidden from library
              </span>
            )}
          </div>
          <h1
            id="details-title"
            className={clsx(
              'mb-4 mt-[18px] text-balance text-[clamp(34px,4.8vw,74px)] font-semibold leading-[1.05] tracking-[-0.055em] text-white [overflow-wrap:anywhere]',
              'min-[761px]:max-[1000px]:text-[46px]',
              'min-[521px]:max-[760px]:text-[38px]',
              'max-[520px]:text-[40px]',
            )}
          >
            {game.title}
          </h1>
          <p className="details-hero-caption text-xs leading-[1.7] text-white/[0.53] max-[520px]:text-[11px]">
            {game.totalPlaytimeSeconds > 0
              ? 'An adventure worth coming back to.'
              : 'Your next adventure starts here.'}
          </p>
          {/* One row: Play / Favorite, then the download status beside them.
              It only wraps under the buttons on narrow windows. */}
          <div className="details-command-row mt-7 flex max-w-full flex-nowrap items-center gap-3 max-[760px]:flex-wrap">
            <LiquidGlass
              surface="toolbar"
              className="details-command-bar inline-flex max-w-full items-center gap-1 border border-white/[0.145] p-1.5 shadow-[inset_0_1px_#ffffff15,0_12px_32px_#0002]"
              radius={999}
            >
              {children}
            </LiquidGlass>
            {aside}
          </div>
        </div>
        {/* Its own GPU layer: WebKit then draws the cover upright and rotates
            it with filtering, instead of painting it tilted, which looked
            pixelated with jagged edges on 1x monitors. */}
        <div
          className={clsx(
            'details-cover-wrap mr-10 w-[165px] shrink-0 rotate-[5deg] motion-reduce:rotate-0',
            'transform-gpu will-change-transform [backface-visibility:hidden]',
            'min-[1700px]:w-[200px]',
            'min-[761px]:max-[1000px]:mr-1.5 min-[761px]:max-[1000px]:w-[140px]',
            'max-[760px]:mr-1.5 max-[760px]:w-[110px]',
            'max-[520px]:hidden',
          )}
          aria-hidden
        >
          <div
            className="details-cover aspect-[2/3] rounded-[20px] border border-white/[0.21] bg-cover bg-center shadow-[0_35px_90px_#0009,inset_0_1px_#fff5]"
            style={{
              backgroundImage: cover ? cssUrl(cover) : artworkPlaceholder(game.id),
            }}
          />
          <div className="details-cover-caption mt-3 flex items-center justify-between px-[5px] text-[9px] text-white/50">
            <span>{providerLabel(game.provider)}</span>
            {game.favorite && <Heart size={13} fill="currentColor" />}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
