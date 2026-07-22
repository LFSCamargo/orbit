import { useMemo, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  Clock3,
  Gamepad2,
  HardDrive,
  Layers,
  Package,
  Play,
  Square,
  Trophy,
  Users,
} from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
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
import { mediaSrc } from '@/lib/media'
import { useUiStore } from '@/stores/ui.store'
import { useThemeLayout } from '@/themes/useThemeLayout'
import type { Game, GameSession } from '@/types/game'
import type { GameContentMap } from '@/types/gameContent'

interface ThemeHomeProps {
  games: Game[]
  heroGame: Game
  activeSession: GameSession | null
  contentByGameId: GameContentMap
  onPlay: (game: Game) => void
  onStop: () => void
  onFavorite: (game: Game) => void
}

export function ThemeHome(props: ThemeHomeProps) {
  const layout = useThemeLayout()
  if (layout === 'ps5') return <Ps5Home {...props} />
  if (layout === 'switch') return <SwitchHome {...props} />
  return <OrbitHome {...props} />
}

function gameStats(game: Game) {
  const achievements = game.achievements ?? []
  const unlocked = achievements.filter((a) => a.unlocked).length
  return { achievements, unlocked }
}

function createHomeGameHandlers(
  activeSession: GameSession | null,
  setHero: (gameId: string) => void,
  onPlay: (game: Game) => void,
  onStop: () => void,
) {
  const selectGame = (game: Game) => setHero(game.id)

  const launchGame = (game: Game) => {
    setHero(game.id)
    if (activeSession?.gameId === game.id) {
      onStop()
    } else {
      onPlay(game)
    }
  }

  return { selectGame, launchGame }
}

function SwitchHome({
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

  const { selectGame, launchGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
  )

  const launchHero = () => {
    if (isRunning) {
      onStop()
    } else {
      onPlay(heroGame)
    }
  }

  return (
    <div className="switch-home relative flex min-h-full flex-1 flex-col" data-hero-tone={heroTone}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="switch-hero-bg absolute inset-0 bg-cover bg-center"
          data-has-landscape={heroLandscape ? 'true' : 'false'}
          style={{
            backgroundImage: heroLandscape
              ? `url(${heroLandscape})`
              : placeholderGradient(heroGame.id),
          }}
        />
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[var(--switch-bg)] via-[var(--switch-bg)]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-[var(--switch-bg)] via-[var(--switch-bg)]/72 to-transparent" />
        <div className="absolute inset-0 bg-[var(--switch-bg)]/18" />
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
                  onClick={() => launchGame(game)}
                  className={clsx(
                    'switch-tile shrink-0 rounded-[18px]',
                    selected && 'switch-tile-selected',
                  )}
                >
                  <div
                    className="square-game-art h-[148px] w-[148px] overflow-hidden rounded-[18px] bg-cover bg-center"
                    style={{
                      backgroundImage: icon ? `url(${icon})` : placeholderGradient(game.id),
                    }}
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
            <div
              className="square-game-art h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[16px] bg-cover bg-center"
              style={{
                backgroundImage: heroThumb
                  ? `url(${heroThumb})`
                  : placeholderGradient(heroGame.id),
              }}
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
    <div className="switch-glass-card rounded-2xl px-3.5 py-2.5 ring-1 ring-white/[0.06]">
      <div className="switch-hero-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="switch-hero-stat-value mt-1.5 truncate text-sm font-semibold">{value}</p>
      <p
        className={clsx(
          'switch-hero-muted mt-1 min-h-[1.75rem] line-clamp-2 text-[10px] leading-snug',
          !detail && 'invisible',
        )}
      >
        {detail || '\u00A0'}
      </p>
    </div>
  )
}

function Ps5Home({
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
  const heroTone = useHeroTone(heroBg ?? null)

  const { selectGame, launchGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
  )

  return (
    <div className="ps5-home relative flex min-h-full flex-1 flex-col overflow-hidden" data-hero-tone={heroTone}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: heroBg
              ? `url(${heroBg})`
              : placeholderGradient(heroGame.id),
          }}
        />
        <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[var(--ps5-bg)] via-[var(--ps5-bg)]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[var(--ps5-bg)] via-[var(--ps5-bg)]/65 to-transparent" />
        <div className="absolute inset-0 bg-[var(--ps5-bg)]/15" />
      </div>

      <div className="relative z-10 flex min-h-full flex-col pb-6">
        <div className="scrollbar-none flex shrink-0 items-center gap-2.5 overflow-x-auto px-8 pb-2 pt-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#00439c] text-xl font-bold text-white">
            ⊞
          </div>
          {games.slice(0, 14).map((game, index) => {
            const icon = gameTileImage(game.artwork, 'square')
            const focused = heroGame.id === game.id
            return (
              <Focusable
                key={game.id}
                focusId={`ps5-tile-${game.id}`}
                group="ps5-tiles"
                order={index}
                noScale
                noRing
                onFocusSelect={() => selectGame(game)}
                onClick={() => launchGame(game)}
                className={clsx(
                  'ps5-tile h-14 w-14 shrink-0 overflow-hidden rounded-xl transition-transform duration-200',
                  focused && 'ps5-tile-selected scale-110',
                )}
              >
                <div
                  className="square-game-art h-full w-full bg-cover bg-center"
                  style={{
                    backgroundImage: icon ? `url(${icon})` : placeholderGradient(game.id),
                  }}
                />
              </Focusable>
            )
          })}
        </div>

        <div className="ps5-hero-zone flex flex-1 flex-col px-8 pt-6">
            <div className="flex items-start gap-3">
              <span className="ps5-hero-eyebrow mt-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase">
                {providerLabel(heroGame.provider)}
              </span>
            </div>
            <h1 className="ps5-hero-title mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              {heroGame.title}
            </h1>
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
              <Focusable
                focusId="ps5-more"
                group="ps5-home-actions"
                order={1}
                noScale
                onClick={() => openGameDetails(heroGame.id)}
                className="ps5-hero-more flex h-12 w-12 items-center justify-center rounded-full"
              >
                •••
              </Focusable>
              {heroContent ? (
                <>
                  <StatPill icon={<Package className="h-4 w-4" />} label={heroContent.versionValue} />
                  <StatPill icon={<Layers className="h-4 w-4" />} label={heroContent.dlcValue} />
                </>
              ) : (
                <StatPill
                  icon={<Trophy className="h-4 w-4" />}
                  label={formatAchievementProgress(unlocked, achievements.length)}
                />
              )}
              <StatPill icon={<Clock3 className="h-4 w-4" />} label={formatPlaytime(heroGame.totalPlaytimeSeconds)} />
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
                  <Ps5DashboardCard title="Game version" icon={<Package className="h-4 w-4" />}>
                    <p className="ps5-hero-card-value truncate text-lg font-semibold">{heroContent.versionValue}</p>
                    <p className="ps5-hero-card-muted mt-1 min-h-[1.75rem] line-clamp-2 text-[11px] leading-snug">{heroContent.versionDetail}</p>
                  </Ps5DashboardCard>
                  <Ps5DashboardCard title="DLC installed" icon={<Layers className="h-4 w-4" />}>
                    <p className="ps5-hero-card-value truncate text-lg font-semibold">{heroContent.dlcValue}</p>
                    <p className="ps5-hero-card-muted mt-1 min-h-[1.75rem] line-clamp-2 text-[11px] leading-snug">{heroContent.dlcDetail}</p>
                  </Ps5DashboardCard>
                </>
              ) : (
                <Ps5DashboardCard title="Trophies" icon={<Trophy className="h-4 w-4" />}>
                  <div className="flex gap-4">
                    <TrophyStat count={Math.floor(unlocked * 0.05)} label="P" color="text-gray-300" />
                    <TrophyStat count={Math.floor(unlocked * 0.15)} label="G" color="text-yellow-500" />
                    <TrophyStat count={Math.floor(unlocked * 0.35)} label="S" color="text-gray-400" />
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

function OrbitHome({
  games,
  heroGame,
  activeSession,
  contentByGameId,
  onPlay,
  onStop,
}: ThemeHomeProps) {
  const setHero = useUiStore((s) => s.setHeroGameId)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const heroImage = mediaSrc(heroGame.artwork.hero) || mediaSrc(heroGame.artwork.cover)
  const { achievements, unlocked } = gameStats(heroGame)
  const heroContent = resolveHeroContentDisplay(contentByGameId, heroGame.id)
  const isRunning = activeSession?.gameId === heroGame.id

  // Stable order — never reshuffle on hero change (that breaks focus/clicks).
  const recentGames = useMemo(() => {
    return [...games]
      .filter((game) => !game.hidden)
      .sort((a, b) =>
        (b.lastPlayedAt ?? b.dateAdded).localeCompare(a.lastPlayedAt ?? a.dateAdded),
      )
      .slice(0, 12)
  }, [games])

  const { selectGame, launchGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
  )

  return (
    <div className="orbit-home relative min-h-screen overflow-x-hidden pb-20">
      <div className="relative z-10 px-10 pt-2">
        <section>
          <div className="orbit-hero-frame rounded-[1.25rem]">
            <div className="orbit-hero-frame-inner overflow-hidden rounded-[inherit]">
            <div className="relative min-h-[380px]">
              {heroImage ? (
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="orbit-hero-art absolute inset-0 h-full w-full scale-[1.06] object-cover object-center"
                />
              ) : (
                <div
                  aria-hidden
                  className="orbit-hero-art absolute inset-0 scale-[1.06] bg-cover bg-center"
                  style={{ background: placeholderGradient(heroGame.id) }}
                />
              )}
              <div className="orbit-hero-scrim pointer-events-none absolute inset-0" aria-hidden />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d0f12] via-[#0d0f12]/78 to-transparent" aria-hidden />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-[#0d0f12]/55 to-transparent" aria-hidden />

              <div className="relative flex min-h-[380px] flex-col justify-end p-8 pb-6">
                <div className="max-w-2xl">
                  <p className="orbit-hero-eyebrow text-[10px] font-bold uppercase tracking-[0.24em] text-white/50">
                    {providerLabel(heroGame.provider)}
                  </p>
                  <h2 className="orbit-hero-title mt-3 text-4xl font-bold tracking-tight text-white md:text-[2.65rem]">
                    {heroGame.title}
                  </h2>
                  <p className="orbit-hero-copy mt-3 line-clamp-3 min-h-[4.5rem] max-w-xl text-sm leading-relaxed text-white/70">
                    {heroGame.description || '\u00A0'}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Focusable
                      focusId="orbit-play"
                      group="orbit-actions"
                      order={0}
                      noScale
                      noRing
                      onClick={() => (isRunning ? onStop() : onPlay(heroGame))}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-black shadow-[0_8px_28px_rgba(255,255,255,0.18)]"
                    >
                      {isRunning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                      {isRunning ? 'Stop' : 'Play Game'}
                    </Focusable>
                    <Focusable
                      focusId="orbit-more"
                      group="orbit-actions"
                      order={1}
                      noScale
                      noRing
                      onClick={() => openGameDetails(heroGame.id)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-lg text-white ring-1 ring-white/55"
                    >
                      •••
                    </Focusable>
                  </div>
                </div>

                <NativeGlassPanel
                  imageSrc={heroImage ?? null}
                  variant="orbit"
                  className="orbit-dashboard-glass mt-8 rounded-xl"
                  contentClassName={clsx(
                    'grid gap-0',
                    heroContent ? 'md:grid-cols-4' : 'md:grid-cols-3',
                  )}
                >
                  <OrbitDashboardCell
                    title="Activity"
                    icon={<Clock3 className="h-4 w-4" />}
                    value={formatPlaytime(heroGame.totalPlaytimeSeconds)}
                    detail={`Last played ${formatRelativeDate(heroGame.lastPlayedAt)}`}
                  />
                  {heroContent ? (
                    <>
                      <OrbitDashboardCell
                        title="Game version"
                        icon={<Package className="h-4 w-4" />}
                        value={heroContent.versionValue}
                        detail={heroContent.versionDetail}
                      />
                      <OrbitDashboardCell
                        title="DLC installed"
                        icon={<Layers className="h-4 w-4" />}
                        value={heroContent.dlcValue}
                        detail={heroContent.dlcDetail}
                      />
                    </>
                  ) : (
                    <OrbitDashboardCell
                      title="Achievements"
                      icon={<Trophy className="h-4 w-4" />}
                      value={formatAchievementProgress(unlocked, achievements.length)}
                      detail={`${unlocked} of ${achievements.length || 0} unlocked`}
                    />
                  )}
                  <OrbitDashboardCell
                    title="Storage"
                    icon={<HardDrive className="h-4 w-4" />}
                    value={formatBytes(heroGame.installSizeBytes)}
                    detail="Install size on disk"
                  />
                </NativeGlassPanel>
              </div>
            </div>
            </div>
          </div>
        </section>

        <section className="overflow-visible pt-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
            Recent Games
          </p>
          <div className="orbit-recent-row scrollbar-none -mx-2 flex gap-4 overflow-x-auto px-2 pb-4 pt-5">
            {recentGames.map((game, index) => {
              const cover = gameTileImage(game.artwork, 'portrait')
              const selected = heroGame.id === game.id
              return (
                <Focusable
                  key={game.id}
                  focusId={`orbit-recent-${game.id}`}
                  group="orbit-recent"
                  order={index}
                  noScale
                  noRing
                  onFocusSelect={() => selectGame(game)}
                  onClick={() => launchGame(game)}
                  className={clsx(
                    'orbit-game-card h-[248px] w-[156px] shrink-0 rounded-xl bg-transparent',
                    selected && 'orbit-game-card-selected',
                  )}
                >
                  <div
                    className="h-full w-full overflow-hidden rounded-xl bg-cover bg-center ring-1 ring-white/10"
                    style={{
                      backgroundImage: cover ? `url(${cover})` : placeholderGradient(game.id),
                    }}
                  />
                </Focusable>
              )
            })}
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm text-white/50">
            <Gamepad2 className="h-3.5 w-3.5" />
            Last two weeks · {formatPlaytime(heroGame.totalPlaytimeSeconds)}
          </p>
        </section>
      </div>
    </div>
  )
}

function OrbitDashboardCell({
  title,
  icon,
  value,
  detail,
}: {
  title: string
  icon: ReactNode
  value: string
  detail: string
}) {
  return (
    <div className="orbit-dashboard-cell border-white/[0.08] p-4 md:border-r md:last:border-r-0">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-white/55">
        {icon}
        {title}
      </div>
      <p className="truncate text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 min-h-[1.75rem] line-clamp-2 text-[11px] leading-snug text-white/45">{detail}</p>
    </div>
  )
}

function StatPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="ps5-hero-pill inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
      {icon}
      {label}
    </span>
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
