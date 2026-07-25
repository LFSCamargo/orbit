import { useMemo, useState, type ReactNode } from 'react'
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
} from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { resolveHeroContentDisplay } from '@/components/home/GameContentBadge'
import { NativeGlassPanel } from '@/components/home/NativeGlassPanel'
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
import type { Game } from '@/types/game'
import {
  createHomeGameHandlers,
  gameStats,
  type ThemeHomeProps,
} from '../hooks/useHomeGameActions'

export function OrbitHome({
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
  const homeRows = useMemo(() => {
    const visible = games.filter((game) => !game.hidden)
    const recentlyPlayed = [...visible]
      .filter((game) => game.lastPlayedAt)
      .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
    const byProvider = (provider: Game['provider']) =>
      visible.filter((game) => game.provider === provider)

    return [
      {
        title: 'Recently Played',
        group: 'orbit-recent',
        games: recentlyPlayed,
        showPlaytime: true,
      },
      {
        title: 'Switch Games',
        group: 'orbit-switch',
        games: byProvider('astris'),
      },
      {
        title: 'Game Hub',
        group: 'orbit-gamehub',
        games: byProvider('gamehub'),
      },
      {
        title: 'Steam Games',
        group: 'orbit-steam',
        games: byProvider('steam'),
      },
    ].filter((row) => row.games.length > 0)
  }, [games])

  const { selectGame, activateGame } = createHomeGameHandlers(
    activeSession,
    setHero,
    onPlay,
    onStop,
    heroGame.id,
  )

  const [rowSelection, setRowSelection] = useState<Record<string, string>>({})

  const rowSelectedId = (rowGroup: string, rowGames: Game[]) => {
    const stored = rowSelection[rowGroup]
    if (stored && rowGames.some((game) => game.id === stored)) return stored
    return rowGames[0]?.id ?? ''
  }

  const selectRowGame = (rowGroup: string, game: Game) => {
    setRowSelection((prev) => ({ ...prev, [rowGroup]: game.id }))
    selectGame(game)
  }

  const activateRowGame = (rowGroup: string, game: Game) => {
    setRowSelection((prev) => ({ ...prev, [rowGroup]: game.id }))
    activateGame(game)
  }

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
                <div
                  className="orbit-hero-scrim pointer-events-none absolute inset-0"
                  aria-hidden
                />
                <div
                  className="via-[#0d0f12]/78 pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d0f12] to-transparent"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[55%] bg-gradient-to-b from-[#0d0f12]/55 to-transparent"
                  aria-hidden
                />

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
                        {isRunning ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 fill-current" />
                        )}
                        {isRunning ? 'Stop' : 'Play Game'}
                      </Focusable>
                      <Focusable
                        focusId="orbit-more"
                        group="orbit-actions"
                        order={1}
                        noScale
                        noRing
                        onClick={() => openGameDetails(heroGame.id)}
                        className="bg-white/12 inline-flex h-11 w-11 items-center justify-center rounded-full text-lg text-white ring-1 ring-white/55"
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

        {homeRows.map((row, rowIndex) => {
          const selectedId = rowSelectedId(row.group, row.games)
          const selectedInRow = row.games.find((game) => game.id === selectedId)

          return (
            <section
              key={row.group}
              className={clsx('overflow-visible', rowIndex === 0 ? 'pt-10' : 'mt-10')}
            >
              <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
                {row.title} ⋅{' '}
                {row.showPlaytime && selectedInRow ? (
                  <p className="flex items-center gap-2 text-xs text-white/50">
                    <Gamepad2 className="h-3.5 w-3.5" />
                    Last two weeks · {formatPlaytime(selectedInRow.totalPlaytimeSeconds)}
                  </p>
                ) : null}
              </p>
              <div className="orbit-recent-row scrollbar-none -mx-2 flex gap-4 overflow-x-auto px-2 pb-4 pt-5">
                {row.games.map((game, index) => {
                  const cover = gameTileImage(game.artwork, 'portrait')
                  const selected = selectedId === game.id
                  return (
                    <Focusable
                      key={`${row.group}-${game.id}`}
                      focusId={`${row.group}-${game.id}`}
                      group={row.group}
                      order={index}
                      noScale
                      noRing
                      onFocusSelect={() => selectRowGame(row.group, game)}
                      onClick={() => activateRowGame(row.group, game)}
                      className={clsx(
                        'orbit-game-card h-[248px] w-[156px] shrink-0 rounded-xl bg-transparent',
                        selected && 'orbit-game-card-selected',
                      )}
                    >
                      <div
                        className="h-full w-full overflow-hidden rounded-xl bg-cover bg-center ring-1 ring-white/10"
                        style={{
                          backgroundImage: cover
                            ? cssUrl(cover)
                            : placeholderGradient(game.id),
                        }}
                      />
                    </Focusable>
                  )
                })}
              </div>
            </section>
          )
        })}
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
      <p className="mt-1 line-clamp-2 min-h-[1.75rem] text-[11px] leading-snug text-white/45">
        {detail}
      </p>
    </div>
  )
}
