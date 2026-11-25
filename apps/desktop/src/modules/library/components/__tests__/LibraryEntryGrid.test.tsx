import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { LibraryEntryGrid } from '../LibraryEntryGrid'
import { LibrarySections, SECTION_PAGE_SIZE } from '../LibrarySections'
import { useUiStore } from '@/stores/ui.store'

const game: Game = {
  id: 'g1',
  title: 'Bombergrounds: Reborn',
  sortTitle: 'bombergrounds reborn',
  provider: 'steam',
  platform: 'macos',
  launchConfig: { type: 'steam', appId: '1' },
  artwork: {},
  favorite: false,
  hidden: false,
  dateAdded: '2026-01-01T00:00:00Z',
  totalPlaytimeSeconds: 0,
  achievements: [],
}

const entry: LibraryEntry = {
  id: 'steam:1',
  steamAppId: '1',
  owned: true,
  preferredInstallationId: null,
  installations: [],
  game,
}

afterEach(() => {
  cleanup()
  act(() => {
    focusManager.setFocus(null)
  })
})

it('keeps the focus ring on the cover instead of boxing the title', () => {
  render(<LibraryEntryGrid entries={[entry]} />)
  const card = screen.getByRole('button', { name: game.title })
  expect(card).toHaveClass('orbit-art-focus')
  expect(card).not.toHaveClass('overflow-hidden')
  expect(card.querySelector('.orbit-art-focus-target')).not.toBeNull()
})

it('gives the grid border box room for outer focus rings without paint clipping', () => {
  const { container } = render(<LibraryEntryGrid entries={[entry]} />)
  const grid = container.querySelector('.library-entry-grid')
  expect(grid).not.toHaveClass('[contain:layout_paint]')
  expect(grid).toHaveClass('-m-2.5', 'p-2.5')
})

const windowsEntry: LibraryEntry = {
  ...entry,
  id: 'steam:1593500',
  steamAppId: '1593500',
  game: { ...game, id: 'g2', title: 'God of War', platform: 'windows' },
}

it('marks each tile with the source it plays from', () => {
  render(<LibraryEntryGrid entries={[entry, windowsEntry]} />)
  expect(screen.getByRole('img', { name: 'Steam · Mac' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Steam · Windows' })).toBeInTheDocument()
})

it('splits the library into source sections only when sources are mixed', () => {
  const { rerender } = render(<LibrarySections entries={[entry, windowsEntry]} />)
  expect(screen.getByRole('heading', { name: /Steam · Mac/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Steam · Windows/ })).toBeInTheDocument()
  const ids = screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('[data-focus-id]')?.getAttribute('data-focus-id'))
  expect(new Set(ids).size).toBe(2)

  rerender(<LibrarySections entries={[entry]} />)
  expect(screen.queryByRole('heading', { name: /Steam · Mac/ })).toBeNull()
})

it('shows how much disk an installed game takes', () => {
  const installed: LibraryEntry = {
    ...entry,
    id: 'steam:2',
    installations: [
      {
        id: 'i1',
        gameId: 'g1',
        platform: 'windows',
        path: '/Orbit/runtimes/containers/games/steam-2/install/game.exe',
        available: true,
        launchType: 'wine',
        sizeBytes: 64_424_509_440,
      },
    ],
  }
  render(<LibraryEntryGrid entries={[installed, entry]} />)
  expect(screen.getByText('Installed · 60 GB')).toBeTruthy()
  expect(screen.getByText('Not installed')).toBeTruthy()
})

it('loads Steam library art progressively, 2x on Retina', () => {
  const { container } = render(<LibraryEntryGrid entries={[entry]} />)
  const art = container.querySelector('.library-entry-art .progressive-artwork')
  expect(art).toBeTruthy()
  expect(art?.querySelector('img[alt="Bombergrounds: Reborn"]')).toHaveAttribute(
    'srcset',
    expect.stringContaining('library_600x900_2x.jpg 2x'),
  )
})

function many(count: number, base: LibraryEntry, prefix: string): LibraryEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `${prefix}-${index}`,
    game: { ...base.game, id: `${prefix}-${index}`, title: `${prefix} ${index}` },
  }))
}

it('pages each section and collapses it on its own', () => {
  useUiStore.setState({ librarySectionsCollapsed: [] })
  render(
    <LibrarySections
      entries={[...many(SECTION_PAGE_SIZE + 5, entry, 'mac'), windowsEntry]}
    />,
  )
  const mac = screen.getByRole('region', { name: /Steam · Mac/ })
  expect(mac.querySelectorAll('[role="listitem"]')).toHaveLength(SECTION_PAGE_SIZE)
  fireEvent.click(screen.getByRole('button', { name: 'Show more · 5 left' }))
  expect(mac.querySelectorAll('[role="listitem"]')).toHaveLength(SECTION_PAGE_SIZE + 5)

  fireEvent.click(screen.getByRole('button', { name: /Steam · Mac/ }))
  expect(mac.querySelectorAll('[role="listitem"]')).toHaveLength(0)
  expect(screen.getByRole('button', { name: /Steam · Windows/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }))
  fireEvent.click(screen.getByRole('button', { name: 'Expand all' }))
  expect(mac.querySelectorAll('[role="listitem"]').length).toBeGreaterThan(0)
})

it('opens every section and shows every match while searching', () => {
  useUiStore.setState({ librarySectionsCollapsed: ['steam-mac'] })
  render(
    <LibrarySections
      searching
      entries={[...many(SECTION_PAGE_SIZE + 5, entry, 'mac'), windowsEntry]}
    />,
  )
  const mac = screen.getByRole('region', { name: /Steam · Mac/ })
  expect(mac.querySelectorAll('[role="listitem"]')).toHaveLength(SECTION_PAGE_SIZE + 5)
  expect(screen.queryByRole('button', { name: 'Collapse all' })).toBeNull()
})

it('keeps cloud game tiles to the card itself, with Play on the details page', () => {
  const cloudEntry: LibraryEntry = {
    ...entry,
    id: 'xcloud:9NBLGGH4R315',
    game: { ...game, id: 'xc1', title: 'Dead Space', provider: 'xcloud' },
    installations: [],
  }
  render(<LibraryEntryGrid entries={[cloudEntry]} />)
  expect(screen.getByText('Dead Space')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Add to library/ })).toBeNull()
})
