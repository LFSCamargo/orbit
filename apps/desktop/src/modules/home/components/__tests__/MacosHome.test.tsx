import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { MacosHome } from '../MacosHome'

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
