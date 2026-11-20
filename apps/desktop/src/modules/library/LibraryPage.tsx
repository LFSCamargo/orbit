import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Gamepad2, Plus, RefreshCw, SearchX } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Focusable } from '@/components/focus/Focusable'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useHasFavorites } from '@/hooks/useHasFavorites'
import { useLibrary } from '@/hooks/useLibrary'
import { fallbackLibraryView, showFavoritesTab } from '@/lib/favoritesTab'
import {
  listXcloudCatalog,
  refreshSteamWindowsLibrary,
  scanSteamInstallations,
  scanSteamLibrary,
} from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import { useSettingsControllerFocus } from '@/modules/settings/hooks/useSettingsControllerFocus'
import { LibrarySections } from './components/LibrarySections'
import { LibrarySkeleton } from './components/LibrarySkeleton'
import { LibraryToolbar } from './components/LibraryToolbar'
import { BusyLabel } from '@/components/feedback/BusyLabel'
import { useXcloudCatalog } from '@/modules/xcloud/hooks/useXcloud'
import { XBOX_CLOUD_ENABLED } from '@/lib/features'
import { useEffect } from 'react'

/** How long typing must pause before Library and Search look a title up. */
export const SEARCH_DEBOUNCE_MS = 250

const workspaceButtonClass =
  'workspace-button inline-flex min-h-12 items-center justify-center gap-2.5 border border-white/[0.16] bg-white/[0.08] px-5 py-3 font-[550] disabled:opacity-45'

export function LibraryPage({ search = false }: { search?: boolean }) {
  const root = useSettingsControllerFocus()
  const filters = useUiStore((s) => s.libraryFilters)
  const setFilters = useUiStore((s) => s.setLibraryFilters)
  const searchQuery = useUiStore((s) => s.searchQuery)
  const setSearchQuery = useUiStore((s) => s.setSearchQuery)
  const view = useUiStore((s) => s.libraryView)
  const setView = useUiStore((s) => s.setLibraryView)
  const platform = useUiStore((s) => s.libraryPlatform)
  const setPlatform = useUiStore((s) => s.setLibraryPlatform)
  const openAddGame = useUiStore((s) => s.openAddGame)
  const client = useQueryClient()
  const { hasFavorites, isReady } = useHasFavorites()
  const visibleView = fallbackLibraryView(view, hasFavorites, isReady) ?? view
  // The Game Pass cloud catalog is cached server-side; once it arrives, All
  // games picks it up as its own section.
  const cloudCatalog = useXcloudCatalog(XBOX_CLOUD_ENABLED)
  useEffect(() => {
    if (cloudCatalog.dataUpdatedAt)
      void client.invalidateQueries({ queryKey: ['library'] })
  }, [client, cloudCatalog.dataUpdatedAt])
  // The field follows every key; the lookup waits for typing to pause.
  const query = search ? searchQuery : filters.query
  const lookup = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const library = useLibrary({
    query: lookup,
    view: search ? 'all' : visibleView,
    // Every title at once; sections page on screen.
    limit: 5000,
    includeCloudCatalog: XBOX_CLOUD_ENABLED,
    sort: filters.sort,
    // Search covers everything; the Library page's platform filter would
    // hide cloud titles (no installation) and anything off-platform.
    platform: search ? 'all' : platform,
  })
  const refresh = useMutation({
    mutationFn: async () => {
      await Promise.all([
        scanSteamLibrary(),
        scanSteamInstallations(),
        refreshSteamWindowsLibrary(),
        ...(XBOX_CLOUD_ENABLED ? [listXcloudCatalog(true)] : []),
      ])
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['library'] })
      await client.invalidateQueries({ queryKey: ['games'] })
      await client.invalidateQueries({ queryKey: ['steam-windows-library'] })
    },
  })
  const entries = library.data?.pages.flatMap((p) => p.entries) ?? []
  return (
    <ThemePage title={search ? 'Search' : 'Library'}>
      <div
        ref={root}
        className={clsx('library-workspace mx-auto max-w-[1800px] px-0 pb-12 pt-5')}
      >
        <header
          className={clsx(
            'library-heading mb-7 flex items-center justify-between gap-6 max-[1100px]:items-start',
          )}
        >
          <div>
            <p
              className={clsx(
                'workspace-eyebrow mb-2.5 text-xs font-[650] tracking-[0.16em] text-white/[0.62]',
              )}
            >
              YOUR COLLECTION
            </p>
            <h1
              className={clsx(
                'font-display text-[clamp(28px,3vw,42px)] font-[650] leading-[1.15] tracking-[-0.04em]',
              )}
            >
              {search ? 'Find your next escape.' : 'All your games. One place.'}
            </h1>
            <p className={clsx('mt-2.5 text-orbit-muted')}>
              {library.data?.pages[0]?.total ?? 0} games
              {library.isFetching && !library.isPending ? ' · Updating…' : ''}
            </p>
          </div>
          <div
            className={clsx(
              'library-header-actions flex shrink-0 gap-2.5 max-[1100px]:flex-wrap',
            )}
          >
            <Focusable
              focusId="library-refresh"
              group="library-toolbar"
              order={0}
              noScale
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
              className={clsx(workspaceButtonClass, 'orbit-glass-control rounded-full')}
              aria-label="Refresh library"
            >
              <RefreshCw
                size={19}
                className={refresh.isPending ? 'animate-spin' : undefined}
              />
              Refresh
            </Focusable>
            <Focusable
              focusId="library-add"
              group="library-toolbar"
              order={1}
              noScale
              onClick={openAddGame}
              className={clsx(workspaceButtonClass, 'rounded-full')}
            >
              <Plus size={19} />
              Add games
            </Focusable>
          </div>
        </header>
        <LibraryToolbar
          search={search}
          view={visibleView}
          query={query}
          sort={filters.sort}
          platform={platform}
          onView={setView}
          onQuery={(value) =>
            search ? setSearchQuery(value) : setFilters({ query: value })
          }
          onSort={(sort) => setFilters({ sort })}
          onPlatform={setPlatform}
          onClear={() => setSearchQuery('')}
          showFavorites={showFavoritesTab({
            hasFavorites,
            probeReady: isReady,
            viewingFavorites: visibleView === 'favorites',
          })}
        />
        {refresh.isError && (
          <p role="alert">
            Could not refresh all folders. Your saved library is still available.{' '}
            {String(refresh.error)}
          </p>
        )}
        {library.isPending ? (
          <LibrarySkeleton label="Loading library" />
        ) : library.isError ? (
          <div
            className={clsx(
              'workspace-empty border-white/12 rounded-3xl border bg-[rgb(20_24_30/0.55)] px-6 py-16 text-center',
            )}
          >
            <h2 className={clsx('mb-3 font-display text-2xl')}>
              Could not load your library
            </h2>
            <Focusable
              focusId="library-retry"
              group="library-empty"
              order={0}
              onClick={() => void library.refetch()}
            >
              Try again
            </Focusable>
          </div>
        ) : entries.length ? (
          <LibrarySections
            entries={entries}
            screen={search ? 'search' : 'library'}
            searching={Boolean(lookup)}
          />
        ) : lookup ? (
          <EmptyState
            icon={SearchX}
            title={`No games match “${lookup}”`}
            description={
              search || (visibleView === 'all' && platform === 'all')
                ? 'Check the spelling, or try a shorter title.'
                : 'Nothing in this view matches. Try every game and platform.'
            }
            actions={[
              {
                label: 'Clear search',
                focusId: 'library-empty-clear',
                group: 'library-empty',
                onClick: () => (search ? setSearchQuery('') : setFilters({ query: '' })),
              },
              ...(!search && (visibleView !== 'all' || platform !== 'all')
                ? [
                    {
                      label: 'Show all games',
                      focusId: 'library-empty-all',
                      group: 'library-empty',
                      onClick: () => {
                        setView('all')
                        setPlatform('all')
                      },
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <EmptyState
            icon={Gamepad2}
            title="Your library is waiting"
            description="Add a Steam library folder in Settings, or add a game yourself. Installed games show up here."
            actions={[
              {
                label: 'Add games',
                focusId: 'library-empty-add',
                group: 'library-empty',
                onClick: openAddGame,
              },
              {
                label: 'Library settings',
                focusId: 'library-empty-settings',
                group: 'library-empty',
                onClick: () => {
                  useUiStore.getState().setSettingsTab('library')
                  useUiStore.getState().setScreen('settings')
                },
              },
            ]}
          />
        )}
        {library.hasNextPage && (
          <Focusable
            focusId="library-more"
            group="library-pagination"
            order={0}
            disabled={library.isFetchingNextPage}
            className={clsx(workspaceButtonClass, 'mt-6 rounded-full')}
            onClick={() => void library.fetchNextPage()}
          >
            <BusyLabel busy={library.isFetchingNextPage}>Show more games</BusyLabel>
          </Focusable>
        )}
      </div>
    </ThemePage>
  )
}
