import { motion } from 'framer-motion'
import { ProviderBadge } from '@/components/game/ProviderBadge'
import { gameTileImage } from '@/lib/artwork'
import {
  formatPlaytime,
  formatRelativeDate,
  placeholderGradient,
} from '@/lib/format'
import { mediaSrc } from '@/lib/media'
import type { ThemeLayout } from '@/themes/useThemeLayout'
import type { Game } from '@/types/game'

type DetailsHeroProps = {
  game: Game
  layout: ThemeLayout
}

export function DetailsHero({ game, layout }: DetailsHeroProps) {
  const isSwitch = layout === 'switch'
  const isPs5 = layout === 'ps5'
  const isThemedShell = isSwitch || isPs5

  const heroSrc = mediaSrc(game.artwork.hero)
  const coverSrc = mediaSrc(game.artwork.cover)
  const iconSrc = mediaSrc(game.artwork.icon)
  const tileSrc = gameTileImage(
    game.artwork,
    layout === 'switch' || layout === 'ps5' ? 'square' : 'portrait',
  )
  const hero = heroSrc || placeholderGradient(game.id)

  const heroFade = isPs5
    ? 'linear-gradient(180deg, var(--ps5-bg) 0%, transparent 28%, transparent 55%, var(--ps5-bg) 100%)'
    : isSwitch
      ? 'linear-gradient(180deg, var(--switch-bg) 0%, transparent 28%, transparent 55%, var(--switch-bg) 100%)'
      : undefined

  return (
    <div
      className={`relative overflow-hidden ${
        isThemedShell ? 'min-h-[36vh] rounded-2xl ring-1 ring-white/10' : 'min-h-[48vh]'
      }`}
      style={{
        backgroundImage: heroSrc
          ? isThemedShell
            ? `url(${heroSrc})`
            : `linear-gradient(180deg, rgba(4,6,10,0.35), rgba(4,6,10,0.92)), url(${heroSrc})`
          : hero,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {isThemedShell ? (
        <>
          <div
            className="details-hero-scrim pointer-events-none absolute inset-0 bg-black/50"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: heroFade }}
            aria-hidden
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-orbit-canvas via-orbit-canvas/70 to-transparent" />
      )}
      <div
        className={`relative z-10 flex items-end gap-8 ${
          isThemedShell
            ? 'min-h-[36vh] px-6 pb-8 pt-6'
            : 'min-h-[48vh] px-10 pb-10 pt-28'
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={`hidden shrink-0 overflow-hidden sm:block ${
            isSwitch || isPs5
              ? 'square-game-art bg-black'
              : 'shadow-hero ring-1 ring-white/10'
          } ${
            layout === 'switch' || layout === 'ps5'
              ? 'h-40 w-40 rounded-[1.25rem]'
              : 'h-72 w-52 rounded-card'
          }`}
          style={{
            background:
              layout === 'switch' || layout === 'ps5'
                ? '#000'
                : placeholderGradient(game.id),
          }}
        >
          {(layout === 'switch' || layout === 'ps5'
            ? tileSrc || iconSrc
            : coverSrc) && (
            <img
              src={
                (layout === 'switch' || layout === 'ps5'
                  ? tileSrc || iconSrc
                  : coverSrc)!
              }
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </motion.div>
        <div className="max-w-2xl">
          <ProviderBadge provider={game.provider} />
          <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">
            {game.title}
          </h1>
          {game.description && (
            <p
              className={`mt-3 max-w-xl text-sm leading-relaxed ${
                isThemedShell ? 'text-white/70' : 'text-orbit-muted'
              }`}
            >
              {game.description}
            </p>
          )}
          <p className={`mt-3 ${isThemedShell ? 'text-white/60' : 'text-orbit-muted'}`}>
            {game.platform} · {formatPlaytime(game.totalPlaytimeSeconds)} · Last played{' '}
            {formatRelativeDate(game.lastPlayedAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
