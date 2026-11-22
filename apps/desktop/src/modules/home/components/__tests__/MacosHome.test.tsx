import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { useUiStore } from '@/stores/ui.store'
import { MacosHome } from '../MacosHome'

vi.mock('../../lib/carouselArtwork', () => ({
  cachedCarouselArtwork: (url?: string) => url,
  preloadCarouselArtwork: async () => true,
}))

const game: Game = {
  id: 'g1',
  title: 'Resident Evil 2',
  sortTitle: 'resident evil 2',
  description: 'Survive Raccoon City.',
  provider: 'steam',
  platform: 'macos',
  launchConfig: { type: 'steam', appId: '883710' },
  artwork: {},
  favorite: false,
  hidden: false,
  dateAdded: '2026-01-01T00:00:00Z',
  lastPlayedAt: '2026-01-02T00:00:00Z',
  totalPlaytimeSeconds: 3600,
  achievements: [],
}

const entry: LibraryEntry = {
  id: 'steam:883710',
  steamAppId: '883710',
  owned: true,
  preferredInstallationId: null,
  installations: [
    {
      id: 'g1',
      gameId: 'g1',
      platform: 'macos',
      path: '/Games/RE2.app',
      available: true,
      launchType: 'steam',
    },
  ],
  game,
}

afterEach(() => {
  cleanup()
  act(() => {
    focusManager.setFocus(null)
  })
})

function renderHome() {
  const onPlay = vi.fn()
  const onStop = vi.fn()
  const onFavorite = vi.fn()
  render(
    <MacosHome
      entries={[entry]}
      heroEntry={entry}
      activeSession={null}
      onPlay={onPlay}
      onStop={onStop}
      onFavorite={onFavorite}
    />,
  )
  return { onPlay, onStop, onFavorite }
}

it('shows the Steam horizontal logo on the hero when the logo slot is empty', () => {
  renderHome()
  expect(document.querySelector('.macos-hero-logo')).toHaveAttribute(
    'src',
    'https://cdn.akamai.steamstatic.com/steam/apps/883710/logo.png',
  )
})

it('keeps the focus ring on the cover instead of boxing the title', () => {
  renderHome()
  const tile = screen.getByRole('button', { name: `${game.title}, selected` })
  expect(tile).toHaveClass('orbit-art-focus', 'macos-game-tile')
  expect(tile.querySelector('.orbit-art-focus-target')).not.toBeNull()
})

it('scales the whole focused tile so the outline selector tracks it', () => {
  renderHome()
  const tile = screen.getByRole('button', { name: `${game.title}, selected` })
  expect(tile).toHaveClass('macos-game-tile')
  act(() => {
    focusManager.setFocus(null)
  })
  expect(tile).not.toHaveClass('scale-[1.03]')
  act(() => {
    focusManager.setFocus(`macos-game-${entry.id}`)
  })
  expect(tile).toHaveClass('scale-[1.03]', 'z-10')
})

it('keeps tight-row controls static while a tile is focused', () => {
  renderHome()
  const play = screen.getByRole('button', { name: /Jump back in/ })
  act(() => {
    focusManager.setFocus('macos-play')
  })
  expect(play).not.toHaveClass('scale-[1.03]')
})

it('keeps the shelf in document flow so compact windows do not grow horizontally', () => {
  renderHome()
  const grid = document.querySelector('.macos-game-grid')
  expect(grid).toHaveClass('overflow-x-auto', 'min-w-0')
  expect(grid).not.toHaveClass('absolute')
})

it('leaves a short carousel unfaded and without particle fragments', () => {
  renderHome()
  expect(document.querySelector('[data-edge-particles]')).toBeNull()
  const grid = document.querySelector('.macos-game-grid')
  expect(grid?.className).not.toContain('[mask-image:')
  expect(grid?.getAttribute('data-shelf-looping')).toBe('false')
  const wrap = document.querySelector('.macos-shelf-viewport-fade')
  expect(wrap?.className).not.toContain('[mask-image:')
  expect(wrap?.className).not.toContain('-mx-')
  expect(screen.getByRole('button', { name: `${game.title}, selected` })).not.toHaveClass(
    'snap-start',
  )
})

it('opens details on the first card activation without launching', () => {
  const { onPlay, onStop } = renderHome()
  fireEvent.click(screen.getByRole('button', { name: `${game.title}, selected` }))
  expect(useUiStore.getState().selectedGameId).toBe(entry.id)
  expect(useUiStore.getState().screen).toBe('game-details')
  expect(onPlay).not.toHaveBeenCalled()
  expect(onStop).not.toHaveBeenCalled()
})

it('omits the Favorites filter until a game is marked favorite', () => {
  renderHome()
  expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Installed' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Favorites' })).not.toBeInTheDocument()
})

it('offers Recent, Installed and Favorites filters when favorites exist', () => {
  render(
    <MacosHome
      entries={[entry]}
      heroEntry={entry}
      activeSession={null}
      onPlay={vi.fn()}
      onStop={vi.fn()}
      onFavorite={vi.fn()}
      showFavorites
    />,
  )
  for (const name of ['Recent', 'Installed', 'Favorites']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
})

it('synchronizes native keyboard focus with controller activation', () => {
  renderHome()
  fireEvent.focus(screen.getByRole('button', { name: `${game.title}, selected` }))
  expect(focusManager.getFocusedId()).toBe(`macos-game-${entry.id}`)
})

it('asks to sign in before playing a Windows Steam title', () => {
  const windows: LibraryEntry = {
    ...entry,
    installations: [
      {
        id: 'win',
        gameId: 'g1',
        platform: 'windows',
        path: '/Games/RE2.exe',
        available: true,
        launchType: 'wine',
      },
    ],
    game: {
      ...game,
      platform: 'windows',
      launchConfig: {
        type: 'wine',
        profile: {
          executable: '/Games/RE2.exe',
          runtimePath: '/wine',
          arguments: [],
          environment: {},
        },
      },
    },
  }
  const onPlay = vi.fn()
  render(
    <MacosHome
      entries={[windows]}
      heroEntry={windows}
      activeSession={null}
      steamReady={false}
      onPlay={onPlay}
      onStop={vi.fn()}
      onFavorite={vi.fn()}
    />,
  )
  useUiStore.setState({ screen: 'home', settingsTab: 'general' })
  const play = screen.getByRole('button', { name: 'Sign in to Steam' })
  expect(play).toBeEnabled()
  fireEvent.click(play)
  expect(onPlay).not.toHaveBeenCalled()
  expect(useUiStore.getState().screen).toBe('settings')
  expect(useUiStore.getState().settingsTab).toBe('steam')
})

it('paints 1:1 icon art on the shelf instead of portrait covers', () => {
  const withArt: LibraryEntry = {
    ...entry,
    game: {
      ...game,
      artwork: {
        icon: 'https://cdn.example/icon.png',
        cover: 'https://cdn.example/cover.jpg',
        hero: 'https://cdn.example/hero.jpg',
      },
    },
  }
  render(
    <MacosHome
      entries={[withArt]}
      heroEntry={withArt}
      activeSession={null}
      onPlay={vi.fn()}
      onStop={vi.fn()}
      onFavorite={vi.fn()}
    />,
  )
  const art = document.querySelector('.square-game-art') as HTMLElement
  expect(art.style.backgroundImage).toContain('icon.png')
  expect(art.style.backgroundImage).not.toContain('cover.jpg')
  expect(art.style.backgroundImage).not.toContain('hero.jpg')
})

it('keeps inactive shelf filters and View library readable as white text', () => {
  renderHome()
  // Regression: 50% and 65% white disappeared over bright artwork.
  const installed = screen.getByRole('button', { name: 'Installed' })
  expect(installed).toHaveAttribute('aria-pressed', 'false')
  expect(installed.className).toMatch(/(^|\s)text-white(\s|$)/)
  expect(installed.className).not.toMatch(/text-\[#ffffff/)
  const viewLibrary = screen.getByRole('button', { name: /View library/ })
  expect(viewLibrary.className).toMatch(/(^|\s)text-white(\s|$)/)
})

it('offers Install, not "Jump back in", for a game that is not on this Mac', () => {
  // Regression: Jump back in on Marvel vs. Capcom: Infinite (not installed)
  // opened the launch card only to fail with "Game not found".
  const missing: LibraryEntry = {
    ...entry,
    installations: entry.installations.map((item) => ({ ...item, available: false })),
  }
  const onPlay = vi.fn()
  render(
    <MacosHome
      entries={[missing]}
      heroEntry={missing}
      activeSession={null}
      onPlay={onPlay}
      onStop={vi.fn()}
      onFavorite={vi.fn()}
    />,
  )
  expect(screen.queryByText('Jump back in')).toBeNull()
  expect(document.querySelector('.macos-play')?.textContent).toContain('Install')
  expect(onPlay).not.toHaveBeenCalled()
})

it('never launches the hero game when it is not on this Mac', () => {
  // Regression: "Jump back in" on a game not on this Mac ended in "Game not
  // found". It offers Install (Steam) or details instead.
  const onPlay = vi.fn()
  const away: LibraryEntry = {
    ...entry,
    installations: [{ ...entry.installations[0], available: false }],
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MacosHome
        entries={[away]}
        heroEntry={away}
        activeSession={null}
        onPlay={onPlay}
        onStop={vi.fn()}
        onFavorite={vi.fn()}
      />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(onPlay).not.toHaveBeenCalled()
})
