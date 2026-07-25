import { useMemo, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Clock3, HardDrive, Layers, Package, Trophy, Users } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { resolveHeroContentDisplay } from '@/components/home/GameContentBadge'
import { NativeGlassPanel } from '@/components/home/NativeGlassPanel'
import { Ps5GlassChip } from '@/components/home/Ps5GlassChip'
import { gameTileImage } from '@/lib/artwork'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
  placeholderGradient,
  providerLabel,
} from '@/lib/format'
import { cssUrl, mediaSrc } from '@/lib/media'
import { useUiStore } from '@/stores/ui.store'
import {
  createHomeGameHandlers,
  gameStats,
  type ThemeHomeProps,
} from '../hooks/useHomeGameActions'
import { Ps5TileRow } from './Ps5TileRow'

export function Ps5Home({
  games,
  heroGame,
  activeSession,
  contentByGameId,
  onPlay,
  onStop,
}: ThemeHomeProps) {
  const setHero = useUiStore((s) => s.setHeroGameId)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const heroBg =
    mediaSrc(heroGame.artwork.hero) ||
    mediaSrc(heroGame.artwork.cover) ||
    gameTileImage(heroGame.artwork, 'square')
  const { achievements, unlocked } = gameStats(heroGame)
  const heroContent = resolveHeroContentDisplay(contentByGameId, heroGame.id)
  const isRunning = activeSession?.gameId === heroGame.id

  const carouselGames = useMemo(() => {
    const sorted = [...games]
      .filter((game) => !game.hidden)
      .sort((a, b) =>
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

  return (
    <div className="ps5-home relative flex min-h-full flex-1 flex-col overflow-x-hidden overflow-y-visible">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: heroBg ? cssUrl(heroBg) : placeholderGradient(heroGame.id),
          }}
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="via-[var(--ps5-bg)]/70 absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[var(--ps5-bg)] to-transparent" />
        <div className="via-[var(--ps5-bg)]/80 absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[var(--ps5-bg)] to-transparent" />
        <div className="bg-[var(--ps5-bg)]/35 absolute inset-0" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col pb-6">
        <Ps5TileRow
          carouselGames={carouselGames}
          heroGame={heroGame}
          selectGame={selectGame}
          activateGame={activateGame}
        />

        <div className="ps5-hero-zone flex flex-1 flex-col px-8 pt-5">
          <div className="flex items-start gap-3">
            <span className="ps5-hero-eyebrow mt-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase">
              {providerLabel(heroGame.provider)}
            </span>
          </div>
          <p className="ps5-hero-description mt-3 line-clamp-3 min-h-[5.5rem] max-w-2xl text-lg leading-relaxed">
            {heroGame.description || '\u00A0'}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Focusable
              focusId="ps5-play"
              group="ps5-home-actions"
              order={0}
              noScale
              onClick={() => (isRunning ? onStop() : onPlay(heroGame))}
              className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-black"
            >
              {isRunning ? 'Stop Game' : 'Play Game'}
            </Focusable>
            <Ps5GlassChip
              imageSrc={heroBg ?? null}
              className="h-12 w-12 shrink-0 rounded-full"
              contentClassName="h-full w-full"
            >
              <Focusable
                focusId="ps5-more"
                group="ps5-home-actions"
                order={1}
                noScale
                noRing
                onClick={() => openGameDetails(heroGame.id)}
                className="flex h-full w-full items-center justify-center bg-transparent p-0 text-lg text-white"
              >
                •••
              </Focusable>
            </Ps5GlassChip>
            {heroContent ? (
              <>
                <StatPill
                  imageSrc={heroBg ?? null}
                  icon={<Package className="h-4 w-4" />}
                  label={heroContent.versionValue}
                />
                <StatPill
                  imageSrc={heroBg ?? null}
                  icon={<Layers className="h-4 w-4" />}
                  label={heroContent.dlcValue}
                />
              </>
            ) : (
              <StatPill
                imageSrc={heroBg ?? null}
                icon={<Trophy className="h-4 w-4" />}
                label={formatAchievementProgress(unlocked, achievements.length)}
              />
            )}
            <StatPill
              imageSrc={heroBg ?? null}
              icon={<Clock3 className="h-4 w-4" />}
              label={formatPlaytime(heroGame.totalPlaytimeSeconds)}
            />
          </div>

          <div className="mt-auto pt-10">
            <NativeGlassPanel
              imageSrc={heroBg ?? null}
              variant="ps5"
              className="ps5-dashboard-glass rounded-2xl"
              contentClassName={clsx(
                'grid gap-4 md:gap-0',
                heroContent ? 'md:grid-cols-4' : 'md:grid-cols-3',
              )}
            >
              {heroContent ? (
                <>
                  <Ps5DashboardCard
                    title="Game version"
                    icon={<Package className="h-4 w-4" />}
                  >
                    <p className="ps5-hero-card-value truncate text-lg font-semibold">
                      {heroContent.versionValue}
                    </p>
                    <p className="ps5-hero-card-muted mt-1 line-clamp-2 min-h-[1.75rem] text-[11px] leading-snug">
                      {heroContent.versionDetail}
                    </p>
                  </Ps5DashboardCard>
                  <Ps5DashboardCard
                    title="DLC installed"
                    icon={<Layers className="h-4 w-4" />}
                  >
                    <p className="ps5-hero-card-value truncate text-lg font-semibold">
                      {heroContent.dlcValue}
                    </p>
                    <p className="ps5-hero-card-muted mt-1 line-clamp-2 min-h-[1.75rem] text-[11px] leading-snug">
                      {heroContent.dlcDetail}
                    </p>
                  </Ps5DashboardCard>
                </>
              ) : (
                <Ps5DashboardCard title="Trophies" icon={<Trophy className="h-4 w-4" />}>
                  <div className="flex gap-4">
                    <TrophyStat
                      count={Math.floor(unlocked * 0.05)}
                      label="P"
                      color="text-gray-300"
                    />
                    <TrophyStat
                      count={Math.floor(unlocked * 0.15)}
                      label="G"
                      color="text-yellow-500"
                    />
                    <TrophyStat
                      count={Math.floor(unlocked * 0.35)}
                      label="S"
                      color="text-gray-400"
                    />
                    <TrophyStat count={unlocked} label="B" color="text-amber-700" />
                  </div>
                  <p className="ps5-hero-card-muted mt-3 text-xs">
                    {formatAchievementProgress(unlocked, achievements.length)} unlocked
                  </p>
                </Ps5DashboardCard>
              )}
              <Ps5DashboardCard title="Activity" icon={<Users className="h-4 w-4" />}>
                <p className="ps5-hero-card-value text-2xl font-semibold">
                  {formatPlaytime(heroGame.totalPlaytimeSeconds)}
                </p>
                <p className="ps5-hero-card-muted mt-1 text-sm">
                  Last played {formatRelativeDate(heroGame.lastPlayedAt)}
                </p>
              </Ps5DashboardCard>
              <Ps5DashboardCard title="Storage" icon={<HardDrive className="h-4 w-4" />}>
                <p className="ps5-hero-card-value text-2xl font-semibold">
                  {formatBytes(heroGame.installSizeBytes)}
                </p>
                <p className="ps5-hero-card-muted mt-1 text-sm">Install size on disk</p>
              </Ps5DashboardCard>
            </NativeGlassPanel>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatPill({
  icon,
  label,
  imageSrc,
}: {
  icon: ReactNode
  label: string
  imageSrc: string | null
}) {
  return (
    <Ps5GlassChip
      imageSrc={imageSrc}
      className="rounded-full"
      contentClassName="inline-flex items-center gap-2 px-4 py-2 text-sm text-white"
    >
      {icon}
      {label}
    </Ps5GlassChip>
  )
}

function Ps5DashboardCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="ps5-dashboard-cell p-5 md:border-r md:border-white/[0.08] md:last:border-r-0">
      <div className="ps5-hero-card-label mb-4 flex items-center gap-2 text-sm">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function TrophyStat({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: string
}) {
  return (
    <div className="text-center">
      <Trophy className={clsx('ps5-hero-trophy mx-auto h-7 w-7', color)} />
      <p className="ps5-hero-card-value mt-1 text-lg font-bold">{count}</p>
      <p className="ps5-hero-card-muted text-[10px]">{label}</p>
    </div>
  )
}
