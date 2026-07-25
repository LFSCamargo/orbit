import { useMemo, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Clock3, HardDrive, Layers, Package, Trophy } from 'lucide-react'
import { StatCard } from '@/components/data/StatCard'
import { Focusable } from '@/components/focus/Focusable'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { resolveHeroContentDisplay } from '@/components/home/GameContentBadge'
import { NativeGlassPanel } from '@/components/home/NativeGlassPanel'
import { useHeroTone } from '@/hooks/useHeroTone'
import { gameHeroImage, gameTileImage } from '@/lib/artwork'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  placeholderGradient,
  providerLabel,
} from '@/lib/format'
import { cssUrl } from '@/lib/media'
import { useUiStore } from '@/stores/ui.store'
import {
  createHomeGameHandlers,
  gameStats,
  type ThemeHomeProps,
} from '../hooks/useHomeGameActions'

export function SwitchHome({
  games,
  heroGame,
  activeSession,
  contentByGameId,
  onPlay,
  onStop,
}: ThemeHomeProps) {
  const setHero = useUiStore((s) => s.setHeroGameId)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const heroLandscape =
    gameHeroImage(heroGame.artwork) ?? gameTileImage(heroGame.artwork, 'square')
  const heroThumb = gameTileImage(heroGame.artwork, 'square')
  const heroTone = useHeroTone(heroLandscape ?? null)
  const { achievements, unlocked } = gameStats(heroGame)
  const heroContent = resolveHeroContentDisplay(contentByGameId, heroGame.id)
  const isRunning = activeSession?.gameId === heroGame.id

  const carouselGames = useMemo(() => {
    const sorted = [...games].sort((a, b) =>
      (b.lastPlayedAt ?? b.dateAdded).localeCompare(a.lastPlayedAt ?? a.dateAdded),
    )
    const slice = sorted.slice(0, 16)
    if (!slice.some((game) => game.id === heroGame.id)) {
      return [heroGame, ...slice].slice(0, 16)
    }
    return slice
  }, [games, heroGame])

  const { selectGame, activateGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
    heroGame.id,
  )

  const launchHero = () => {
    if (isRunning) {
      onStop()
    } else {
      onPlay(heroGame)
    }
  }

  return (
    <div
      className="switch-home relative flex min-h-full flex-1 flex-col"
      data-hero-tone={heroTone}
    >
      <div className="pointer-events-none absolute inset-0">
        <div
          className="switch-hero-bg absolute inset-0 bg-cover bg-center"
          data-has-landscape={heroLandscape ? 'true' : 'false'}
          style={{
            backgroundImage: heroLandscape
              ? cssUrl(heroLandscape)
              : placeholderGradient(heroGame.id),
          }}
        />
        <div className="via-[var(--switch-bg)]/55 absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[var(--switch-bg)] to-transparent" />
        <div className="via-[var(--switch-bg)]/72 absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[var(--switch-bg)] to-transparent" />
        <div className="bg-[var(--switch-bg)]/18 absolute inset-0" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col px-8 pb-4 pt-3">
        <div className="shrink-0">
          <h1 className="switch-hero-title py-1 text-[1.75rem] font-normal leading-snug tracking-tight">
            {heroGame.title}
          </h1>

          <div className="switch-carousel scrollbar-none mt-4 flex gap-4 overflow-x-auto px-1 py-3">
            {carouselGames.map((game, index) => {
              const icon = gameTileImage(game.artwork, 'square')
              const selected = heroGame.id === game.id
              return (
                <Focusable
                  key={game.id}
                  focusId={`switch-game-${game.id}`}
                  group="switch-games"
                  order={index}
                  noScale
                  noRing
                  onFocusSelect={() => selectGame(game)}
                  onClick={() => activateGame(game)}
                  className={clsx(
                    'switch-tile shrink-0 rounded-[18px]',
                    selected && 'switch-tile-selected',
                  )}
                >
                  <SquareGameArt
                    image={icon}
                    placeholder={placeholderGradient(game.id)}
                    roundedClassName="rounded-[18px]"
                    className="h-[148px] w-[148px]"
                  />
                </Focusable>
              )
            })}
          </div>
        </div>

        <div className="min-h-6 flex-1" aria-hidden />

        <NativeGlassPanel
          imageSrc={heroLandscape ?? null}
          variant="switch"
          className="switch-glass-panel shrink-0 rounded-[24px] ring-1 ring-white/[0.08]"
          contentClassName="p-5"
        >
          <div className="flex flex-wrap items-center gap-5">
            <SquareGameArt
              image={heroThumb}
              placeholder={placeholderGradient(heroGame.id)}
              roundedClassName="rounded-[16px]"
              className="h-[88px] w-[88px]"
            />

            <div className="min-w-0 flex-1 basis-[14rem]">
              <span className="switch-hero-eyebrow inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                {providerLabel(heroGame.provider)}
              </span>
              {heroGame.description ? (
                <p className="switch-hero-copy mt-3 line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed">
                  {heroGame.description}
                </p>
              ) : (
                <p className="switch-hero-muted mt-3 min-h-[4.5rem] text-sm">
                  Last played {formatRelativeDate(heroGame.lastPlayedAt)}
                </p>
              )}
            </div>

            <div className="switch-home-actions ml-auto flex shrink-0 flex-col gap-2 sm:flex-row">
              <Focusable
                focusId="switch-home-play"
                group="switch-home-actions"
                order={0}
                noScale
                noRing
                onClick={launchHero}
                className={clsx(
                  'rounded-full px-7 py-3 text-sm font-bold text-[#ffffff]',
                  isRunning
                    ? 'bg-[var(--switch-surface-hover)]'
                    : 'bg-[var(--switch-red)]',
                )}
              >
                {isRunning ? 'Stop' : 'Play'}
              </Focusable>
              <Focusable
                focusId="switch-home-options"
                group="switch-home-actions"
                order={1}
                noScale
                noRing
                onClick={() => openGameDetails(heroGame.id)}
                className="switch-hero-options rounded-full px-5 py-3 text-sm font-semibold"
              >
                Options
              </Focusable>
            </div>
          </div>

          <div
            className={clsx(
              'mt-5 grid gap-3',
              heroContent ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-3',
            )}
          >
            <SwitchStatCard
              icon={<Clock3 className="h-4 w-4 text-[var(--switch-cyan)]" />}
              label="Playtime"
              value={formatPlaytime(heroGame.totalPlaytimeSeconds)}
              detail={formatRelativeDate(heroGame.lastPlayedAt)}
            />
            {heroContent ? (
              <>
                <SwitchStatCard
                  icon={<Package className="h-4 w-4 text-[var(--switch-cyan)]" />}
                  label="Game version"
                  value={heroContent.versionValue}
                  detail={heroContent.versionDetail}
                />
                <SwitchStatCard
                  icon={<Layers className="h-4 w-4 text-[#ffb340]" />}
                  label="DLC installed"
                  value={heroContent.dlcValue}
                  detail={heroContent.dlcDetail}
                />
              </>
            ) : (
              <SwitchStatCard
                icon={<Trophy className="h-4 w-4 text-[#ffb340]" />}
                label="Achievements"
                value={formatAchievementProgress(unlocked, achievements.length)}
                detail={`${unlocked} unlocked`}
              />
            )}
            <SwitchStatCard
              icon={<HardDrive className="h-4 w-4 text-[var(--switch-muted)]" />}
              label="Install size"
              value={formatBytes(heroGame.installSizeBytes)}
              detail="On disk"
            />
          </div>
        </NativeGlassPanel>
      </div>
    </div>
  )
}

function SwitchStatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
}) {
  return (
    <StatCard
      icon={icon}
      label={label}
      value={value}
      detail={detail ?? ''}
      className="switch-glass-card rounded-2xl px-3.5 py-2.5 ring-1 ring-white/[0.06]"
      labelClassName="switch-hero-muted text-[10px] font-semibold uppercase tracking-wider"
      valueClassName="switch-hero-stat-value mt-1.5 truncate text-sm font-semibold"
      detailClassName="switch-hero-muted mt-1 line-clamp-2 min-h-[1.75rem] text-[10px] leading-snug"
    />
  )
}
