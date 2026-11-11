import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import { MacosHome } from '../MacosHome'

const game: Game = {
  id: 'g1',
  title: 'Resident Evil 2',
  sortTitle: 'resident evil 2',
  description: 'Survive Raccoon City.',
  provider: 'gamehub',
  platform: 'macos',
  launchConfig: { type: 'open-url', url: 'gamehub://open' },
  artwork: {},
  favorite: false,
  hidden: false,
  dateAdded: '2026-01-01T00:00:00Z',
  lastPlayedAt: '2026-01-02T00:00:00Z',
  totalPlaytimeSeconds: 3600,
  achievements: [],
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
      games={[game]}
      heroGame={game}
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
  // Tile is the hero game, so its accessible name carries the ", selected" suffix.
  const tile = screen.getByRole('button', { name: `${game.title}, selected` })
  expect(tile).toHaveClass('macos-game-tile')
  act(() => {
    focusManager.setFocus(null)
  })
  expect(tile).not.toHaveClass('scale-[1.03]')
  act(() => {
    focusManager.setFocus(`macos-game-${game.id}`)
  })
  // The scale-up transform and the selector outline live on the same element,
  // so the selector cannot drift away from the animated card.
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
