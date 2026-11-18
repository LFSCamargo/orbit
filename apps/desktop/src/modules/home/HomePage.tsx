import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useHomeHero } from './hooks/useHomeHero'
import { ThemeHome } from './ThemeHome'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { useHasFavorites } from '@/hooks/useHasFavorites'
import { useLibrary, useLibraryActions } from '@/hooks/useLibrary'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { isWindowsSteamPlay } from '@/lib/playLibraryEntry'
import { fallbackHomeView, showFavoritesTab } from '@/lib/favoritesTab'
import { useUiStore } from '@/stores/ui.store'
import { useSessionStore } from '@/stores/session.store'
import { buttonClass } from '@/components/ui/button'

export function HomePage() {
  const view = useUiStore((s) => s.homeView)
  const setView = useUiStore((s) => s.setHomeView)
  const { hasFavorites, isReady } = useHasFavorites()
  const visibleView = fallbackHomeView(view, hasFavorites, isReady) ?? view
  const shelf = useLibrary({
    view: visibleView === 'recent' ? 'all' : visibleView,
    sort: 'recently-played',
    limit: 12,
  })
  const shelfEntries = useMemo(
    () => shelf.data?.pages.flatMap((page) => page.entries) ?? [],
    [shelf.data],
  )
  const library = useLibrary({ view: 'all', sort: 'recently-played' })
  const { playEntry, stop } = useGameActions()
  const steam = useSteamWindows()
  const steamReady = steam.status.data?.sessionReady === true
  const { update } = useLibraryActions()
  const openAddGame = useUiStore((s) => s.openAddGame)
  const activeSession = useSessionStore((s) => s.activeSession)
  const entries = useMemo(
    () => library.data?.pages.flatMap((page) => page.entries) ?? [],
    [library.data],
  )
  const heroEntry = useHomeHero(entries, shelfEntries)

  if (library.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center text-orbit-muted">
        Loading library…
      </div>
    )
  }

  if (!heroEntry) {
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
          className={buttonClass({ size: 'lg', className: 'mt-4' })}
        >
          Import games
        </Focusable>
      </div>
    )
  }

  return (
    <ThemeHome
      view={visibleView}
      onView={setView}
      shelfEntries={shelfEntries}
      shelfPending={shelf.isPending}
      shelfError={shelf.isError}
      onRetry={() => void shelf.refetch()}
      entries={entries.filter((entry) => !entry.game.hidden)}
      heroEntry={heroEntry}
      activeSession={activeSession}
      steamReady={steamReady}
      onPlay={(entry) => {
        if (isWindowsSteamPlay(entry) && !steamReady) return
        playEntry.mutate(entry)
      }}
      onStop={() => activeSession && stop.mutate(activeSession.id)}
      onFavorite={(entry) =>
        update.mutate({ id: entry.id, patch: { favorite: !entry.game.favorite } })
      }
      showFavorites={showFavoritesTab({
        hasFavorites,
        probeReady: isReady,
        viewingFavorites: visibleView === 'favorites',
      })}
    />
  )
}
