import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import type { Game } from '@/types/game'
import { ThemeHome } from './ThemeHome'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions, useGames } from '@/hooks/useGames'
import { useGameContentMap } from '@/hooks/useGameContent'
import { useUiStore } from '@/stores/ui.store'
import { useSessionStore } from '@/stores/session.store'
import { useThemeLayout } from '@/themes/useThemeLayout'

function byLastPlayed(a: Game, b: Game) {
  return (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')
}

export function HomePage() {
  const { data: games = [], isLoading } = useGames()
  const { contentByGameId } = useGameContentMap()
  const { launch, stop, favorite } = useGameActions()
  const heroGameId = useUiStore((s) => s.heroGameId)
  const openAddGame = useUiStore((s) => s.openAddGame)
  const activeSession = useSessionStore((s) => s.activeSession)
  const layout = useThemeLayout()
  const isSwitch = layout === 'switch'
  const isPs5 = layout === 'ps5'
  const isThemedShell = isSwitch || isPs5

  const visible = useMemo(() => games.filter((game) => !game.hidden), [games])

  const rows = useMemo(() => {
    const recentlyPlayed = [...visible]
      .filter((game) => game.lastPlayedAt)
      .sort(byLastPlayed)
    const byProvider = (provider: Game['provider']) =>
      visible.filter((game) => game.provider === provider)

    return [
      { title: 'Recently Played', group: 'row-recent', games: recentlyPlayed },
      { title: 'Switch Games', group: 'row-astris', games: byProvider('astris') },
      { title: 'Game Hub', group: 'row-gamehub', games: byProvider('gamehub') },
      { title: 'Steam Games', group: 'row-steam', games: byProvider('steam') },
    ].filter((row) => row.games.length > 0)
  }, [visible])

  const heroGame =
    visible.find((game) => game.id === heroGameId) ??
    rows.find((row) => row.games.length > 0)?.games[0] ??
    visible[0]

  if (isLoading) {
    return (
      <div
        className={`flex flex-1 items-center justify-center ${
          isThemedShell
            ? isSwitch
              ? 'text-[var(--switch-muted)]'
              : 'text-[var(--ps5-muted)]'
            : 'min-h-screen text-orbit-muted'
        }`}
      >
        Loading library…
      </div>
    )
  }

  if (!heroGame) {
    return (
      <div
        className={`flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center ${
          isThemedShell
            ? isSwitch
              ? 'text-[var(--switch-ink)]'
              : 'text-[var(--ps5-ink)]'
            : 'min-h-screen'
        }`}
      >
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full ${
            isSwitch
              ? 'bg-[var(--switch-cyan)]/15 text-[var(--switch-cyan)]'
              : isPs5
                ? 'bg-white/10 text-[var(--ps5-ink)]'
                : 'bg-orbit-accent/15 text-3xl'
          }`}
        >
          {isThemedShell ? <Plus className="h-8 w-8" /> : '+'}
        </div>
        <h1 className="font-display text-4xl font-semibold">Your library is ready</h1>
        <p
          className={`max-w-md ${
            isThemedShell
              ? isSwitch
                ? 'text-[var(--switch-muted)]'
                : 'text-[var(--ps5-muted)]'
              : 'text-orbit-muted'
          }`}
        >
          Import your Steam library or choose an Astris folder. Orbit starts empty so
          everything here is yours.
        </p>
        <Focusable
          focusId="empty-import"
          group="empty-library"
          order={0}
          noScale
          onClick={openAddGame}
          className={`mt-4 rounded-xl px-6 py-3 font-semibold ${
            isSwitch
              ? 'bg-[var(--switch-cyan)] text-[#ffffff]'
              : isPs5
                ? 'bg-white text-black'
                : 'rounded-card bg-orbit-accent text-orbit-canvas'
          }`}
        >
          Import games
        </Focusable>
      </div>
    )
  }

  return (
    <ThemeHome
      games={visible}
      heroGame={heroGame}
      activeSession={activeSession}
      contentByGameId={contentByGameId}
      onPlay={(game) => launch.mutate(game.id)}
      onStop={() => activeSession && stop.mutate(activeSession.id)}
      onFavorite={(game) => favorite.mutate(game.id)}
    />
  )
}
