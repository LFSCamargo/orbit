import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HomePage } from '../HomePage'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryQuery } from '@/types/library'

const query = vi.hoisted(() => vi.fn())
const favorites = vi.hoisted(() => ({ has: false }))
const home = vi.hoisted(() => ({
  showFavorites: undefined as boolean | undefined,
  view: undefined as string | undefined,
}))
vi.mock('@/hooks/useLibrary', () => ({
  useLibrary: (input: LibraryQuery) => {
    query(input)
    return {
      data: {
        pages: [
          {
            entries: [
              {
                id: 'one',
                installations: [],
                game: { title: 'One', dateAdded: 'today' },
              },
            ],
          },
        ],
      },
    }
  },
  useLibraryEntry: () => ({ data: undefined }),
  useLibraryActions: () => ({ update: { mutate: vi.fn() } }),
}))
vi.mock('@/hooks/useHasFavorites', () => ({
  useHasFavorites: () => ({ hasFavorites: favorites.has, isReady: true }),
}))
vi.mock('@/hooks/useGames', () => ({
  useGameActions: () => ({ launch: {}, playEntry: { mutate: vi.fn() }, stop: {} }),
}))
vi.mock('@/hooks/useSteamWindows', () => ({
  useSteamWindows: () => ({ status: { data: { signedIn: true, clientLoggedIn: true } } }),
}))
vi.mock('../ThemeHome', () => ({
  ThemeHome: ({
    onView,
    showFavorites,
    view,
  }: {
    onView: (view: string) => void
    showFavorites?: boolean
    view?: string
  }) => {
    home.showFavorites = showFavorites
    home.view = view
    return <button onClick={() => onView('installed')}>Installed</button>
  },
}))
afterEach(() => {
  cleanup()
  query.mockClear()
  favorites.has = false
  home.showFavorites = undefined
  home.view = undefined
  useUiStore.setState({ homeView: 'recent' })
})
it('queries Installed independently with a bounded preview and remembers the view', () => {
  render(<HomePage />)
  fireEvent.click(screen.getByText('Installed'))
  expect(query).toHaveBeenCalledWith({
    view: 'installed',
    sort: 'recently-played',
    limit: 12,
  })
  expect(useUiStore.getState().homeView).toBe('installed')
})

it('does not offer the Favorites filter when no game is marked favorite', () => {
  render(<HomePage />)
  expect(home.showFavorites).toBe(false)
})

it('offers the Favorites filter after a game is marked favorite', () => {
  favorites.has = true
  render(<HomePage />)
  expect(home.showFavorites).toBe(true)
})

it('shows Recent instead of an empty Favorites shelf', () => {
  useUiStore.setState({ homeView: 'favorites' })
  render(<HomePage />)
  expect(home.view).toBe('recent')
  expect(home.showFavorites).toBe(false)
})
