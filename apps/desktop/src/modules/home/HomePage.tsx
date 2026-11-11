import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { homeHero } from './lib/homeHero'
import { ThemeHome } from './ThemeHome'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions, useGames } from '@/hooks/useGames'
import { useUiStore } from '@/stores/ui.store'
import { useSessionStore } from '@/stores/session.store'

export function HomePage() {
  const { data: games = [], isLoading } = useGames()
  const { launch, stop, favorite } = useGameActions()
  const heroGameId = useUiStore((s) => s.heroGameId)
  const openAddGame = useUiStore((s) => s.openAddGame)
  const activeSession = useSessionStore((s) => s.activeSession)

  const visible = useMemo(() => games.filter((game) => !game.hidden), [games])

  const heroGame = useMemo(() => homeHero(games, heroGameId), [games, heroGameId])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-orbit-muted">
        Loading library…
      </div>
    )
  }

  if (!heroGame) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-orbit-foreground">
        <div className="orbit-glass-control flex h-16 w-16 items-center justify-center rounded-full bg-orbit-accent/15 text-orbit-accent">
          <Plus className="h-8 w-8" />
        </div>
        <h1 className="font-display text-4xl font-semibold">Your library is ready</h1>
        <p className="max-w-md text-orbit-muted">
          Import your Steam library or choose an Astris folder. Orbit starts empty so
          everything here is yours.
        </p>
        <Focusable
          focusId="empty-import"
          group="empty-library"
          order={0}
          noScale
          onClick={openAddGame}
          className="mt-4 rounded-full bg-orbit-accent px-6 py-3 font-semibold text-orbit-canvas"
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
      onPlay={(game) => launch.mutate(game.id)}
      onStop={() => activeSession && stop.mutate(activeSession.id)}
      onFavorite={(game) => favorite.mutate(game.id)}
    />
  )
}
