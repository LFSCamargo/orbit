import { motion } from 'framer-motion'
import { Heart, Play } from 'lucide-react'
import type { Game } from '@/types/game'
import { formatPlaytime, formatRelativeDate, placeholderGradient } from '@/lib/format'
import { mediaSrc } from '@/lib/media'
import { ProviderBadge } from './ProviderBadge'
import { Focusable } from '@/components/focus/Focusable'

interface GameHeroProps {
  game: Game
  onPlay: () => void
  onOpenDetails: () => void
  onToggleFavorite: () => void
  isRunning?: boolean
  onStop?: () => void
}

export function GameHero({
  game,
  onPlay,
  onOpenDetails,
  onToggleFavorite,
  isRunning,
  onStop,
}: GameHeroProps) {
  const hero = mediaSrc(game.artwork.hero)
  const logo = mediaSrc(game.artwork.logo)
  const background = hero || placeholderGradient(game.id)

  return (
    <section className="relative min-h-[58vh] overflow-hidden">
      <motion.div
        key={game.id}
        initial={{ opacity: 0.4, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0"
        style={{
          backgroundImage: hero
            ? `linear-gradient(90deg, rgba(4,6,10,0.92) 0%, rgba(4,6,10,0.55) 48%, rgba(4,6,10,0.35) 100%), url(${hero})`
            : background,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-orbit-canvas via-orbit-canvas/40 to-transparent" />

      <div className="relative z-10 flex h-full min-h-[58vh] flex-col justify-end px-10 pb-10 pt-28">
        <div className="max-w-3xl">
          <ProviderBadge provider={game.provider} />
          {logo ? (
            <img
              src={logo}
              alt=""
              className="mt-5 max-h-24 object-contain object-left drop-shadow-2xl"
            />
          ) : (
            <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight text-white md:text-6xl">
              {game.title}
            </h1>
          )}
          {game.description ? (
            <p className="mt-4 max-w-xl text-base text-orbit-muted md:text-lg">
              {game.description}
            </p>
          ) : (
            <p className="mt-4 max-w-xl text-base text-orbit-muted md:text-lg">
              Last played {formatRelativeDate(game.lastPlayedAt)} ·{' '}
              {formatPlaytime(game.totalPlaytimeSeconds)}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isRunning ? (
              <Focusable
                focusId="hero-stop"
                group="hero-actions"
                order={0}
                onClick={onStop}
                className="rounded-card bg-rose-500/90 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-md"
              >
                Stop
              </Focusable>
            ) : (
              <Focusable
                focusId="hero-play"
                group="hero-actions"
                order={0}
                onClick={onPlay}
                className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-8 py-3.5 text-base font-semibold text-orbit-canvas"
              >
                <Play className="h-5 w-5 fill-current" />
                Play
              </Focusable>
            )}
            <Focusable
              focusId="hero-details"
              group="hero-actions"
              order={1}
              onClick={onOpenDetails}
              className="rounded-card bg-white/10 px-6 py-3.5 text-base font-medium text-white backdrop-blur-panel ring-1 ring-white/15"
            >
              Details
            </Focusable>
            <Focusable
              focusId="hero-favorite"
              group="hero-actions"
              order={2}
              onClick={onToggleFavorite}
              className="rounded-card bg-white/10 p-3.5 text-white backdrop-blur-panel ring-1 ring-white/15"
              aria-label="Toggle favorite"
            >
              <Heart
                className={`h-5 w-5 ${game.favorite ? 'fill-rose-400 text-rose-400' : ''}`}
              />
            </Focusable>
          </div>
        </div>
      </div>
    </section>
  )
}
