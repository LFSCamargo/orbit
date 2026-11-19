import { Clock, Library, Play, Plus, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { useGames } from '@/hooks/useGames'
import { gameTileImage } from '@/lib/artwork'
import { useUiStore } from '@/stores/ui.store'

function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  if (hours < 1) return `${Math.floor(seconds / 60)}m`
  return `${hours}h`
}

const INSIGHTS = clsx(
  'settings-insights flex min-h-0 flex-col gap-[22px] overflow-hidden !border-transparent ![background:transparent] !p-[18px] !shadow-none !backdrop-blur-none',
  '[scrollbar-color:#ffffff25_transparent] [scrollbar-width:thin]',
  'max-[1179px]:!hidden',
  '[@media(max-height:720px)]:gap-3 [@media(max-height:720px)]:p-3.5',
)

const SECTION = clsx(
  'settings-insight-section flex flex-col gap-2.5 px-3 py-5',
  'not-first:border-t not-first:border-white/[0.07]',
  '[@media(max-height:720px)]:not-first:pt-3',
)

const ACTION = clsx(
  'settings-insight-action orbit-glass-control flex w-full items-center gap-[9px] rounded-xl bg-white/[0.04] px-3 py-[11px] text-left text-xs font-[550] text-white/80',
  'hover:bg-white/[0.08] hover:text-white',
  '[&>svg:last-child:not(:first-child)]:ml-auto',
)

export function SettingsInsights() {
  const theme = useActiveTheme()
  const { data: games = [] } = useGames()
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const openAddGame = useUiStore((s) => s.openAddGame)
  const setScreen = useUiStore((s) => s.setScreen)
  const visibleGames = games.filter((game) => !game.hidden)
  const recentGame = visibleGames.reduce<(typeof visibleGames)[number] | undefined>(
    (latest, game) => {
      if (!game.lastPlayedAt) return latest
      if (!latest?.lastPlayedAt) return game
      return game.lastPlayedAt > latest.lastPlayedAt ? game : latest
    },
    undefined,
  )
  const recentCover = recentGame ? gameTileImage(recentGame.artwork, 'square') : undefined

  return (
    <LiquidGlass className={INSIGHTS} radius={24}>
      <section className={SECTION} aria-labelledby="settings-active-theme">
        <p className="settings-insight-eyebrow text-white/44 text-[10px] font-[650] tracking-[0.18em]">
          ACTIVE THEME
        </p>
        <h2
          id="settings-active-theme"
          className="settings-insight-title font-display text-lg font-[650] leading-tight text-white"
        >
          {theme.name}
        </h2>
        <div
          className="settings-theme-swatches flex gap-[7px]"
          aria-label="Active theme colors"
        >
          {[theme.colors.canvas, theme.colors.accent, theme.colors.focus].map((color) => (
            <span
              key={color}
              className="size-6 rounded-full border border-white/15"
              style={{ background: `rgb(${color})` }}
            />
          ))}
        </div>
      </section>

      {recentGame && (
        <section className={SECTION} aria-labelledby="settings-last-played">
          <p className="settings-insight-eyebrow text-white/44 text-[10px] font-[650] tracking-[0.18em]">
            JUMP BACK IN
          </p>
          {recentCover && (
            <img
              className="settings-recent-cover border-white/12 aspect-square size-[72px] rounded-2xl border object-cover [@media(max-height:720px)]:hidden"
              src={recentCover}
              alt=""
            />
          )}
          <h2
            id="settings-last-played"
            className="settings-insight-title font-display text-lg font-[650] leading-tight text-white"
          >
            {recentGame.title}
          </h2>
          <p className="settings-insight-copy text-white/56 flex items-center gap-1.5 text-xs">
            <Clock size={13} />
            {formatPlaytime(recentGame.totalPlaytimeSeconds)} played
          </p>
          <Focusable
            focusId="settings-recent-game"
            group="settings-insights"
            order={0}
            noScale
            onClick={() => openGameDetails(recentGame.id)}
            className={ACTION}
          >
            <Play size={14} fill="currentColor" />
            View game
            <ArrowRight size={14} />
          </Focusable>
        </section>
      )}

      <section className={SECTION} aria-labelledby="settings-quick-actions">
        <p
          className="settings-insight-eyebrow text-white/44 text-[10px] font-[650] tracking-[0.18em]"
          id="settings-quick-actions"
        >
          QUICK ACTIONS
        </p>
        <Focusable
          focusId="settings-quick-add"
          group="settings-insights"
          order={1}
          noScale
          onClick={openAddGame}
          className={ACTION}
        >
          <Plus size={15} />
          Add a game
        </Focusable>
        <Focusable
          focusId="settings-quick-library"
          group="settings-insights"
          order={2}
          noScale
          onClick={() => setScreen('library')}
          className={ACTION}
        >
          <Library size={15} />
          Browse library
          <ArrowRight size={14} />
        </Focusable>
      </section>
    </LiquidGlass>
  )
}
