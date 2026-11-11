import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import { GameCard } from '../GameCard'

const game: Game = {
  id: 'g1',
  title: 'Resident Evil 2',
  sortTitle: 'resident evil 2',
  provider: 'steam',
  platform: 'macos',
  launchConfig: { type: 'open-url', url: 'steam://run/883710' },
  artwork: {},
  favorite: false,
  hidden: false,
  dateAdded: '2026-01-01T00:00:00Z',
  totalPlaytimeSeconds: 0,
  achievements: [],
}

afterEach(() => {
  cleanup()
  act(() => {
    focusManager.setFocus(null)
  })
})

function renderCard() {
  const onSelect = vi.fn()
  const onOpen = vi.fn()
  render(
    <GameCard
      game={game}
      focusId="library-game-g1"
      group="library-grid"
      order={0}
      variant="square"
      className="w-full"
      onSelect={onSelect}
      onOpen={onOpen}
    />,
  )
  return { onSelect, onOpen }
}

it('scales up the card on focus so the selector follows the animation', () => {
  renderCard()
  const card = screen.getByRole('button', { name: new RegExp(game.title) })
  act(() => {
    focusManager.setFocus(null)
  })
  expect(card).not.toHaveClass('scale-[1.03]', 'z-10')
  act(() => {
    focusManager.setFocus('library-game-g1')
  })
  expect(card).toHaveClass('scale-[1.03]', 'z-10')
})

it('opens details and marks the hero game when activated', () => {
  const { onSelect, onOpen } = renderCard()
  const card = screen.getByRole('button', { name: new RegExp(game.title) })
  fireEvent.click(card)
  expect(onSelect).toHaveBeenCalledWith(game.id)
  expect(onOpen).toHaveBeenCalledWith(game.id)
})
