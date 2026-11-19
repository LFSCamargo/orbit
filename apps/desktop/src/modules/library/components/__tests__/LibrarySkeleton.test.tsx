import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { LIBRARY_ENTRY_GRID } from '../libraryGrid'
import { LibrarySkeleton } from '../LibrarySkeleton'

afterEach(cleanup)

it('lays out placeholders in the real card grid, shaped like library cards', () => {
  render(<LibrarySkeleton label="Loading games" />)
  const status = screen.getByRole('status', { name: 'Loading games' })
  const grid = status.querySelector('.library-skeleton-grid') as HTMLElement
  for (const name of LIBRARY_ENTRY_GRID.split(' ')) expect(grid.classList).toContain(name)
  const cards = status.querySelectorAll('.library-skeleton-card')
  expect(cards.length).toBeGreaterThan(0)
  for (const card of cards) {
    // Same shell as LibraryEntryGrid's card: glass panel, 22px corners.
    expect(card.className).toContain('orbit-panel')
    expect(card.className).toContain('rounded-[22px]')
    expect(card.querySelector('.aspect-square')).not.toBeNull()
    expect(card.querySelector('.min-h-\\[88px\\]')).not.toBeNull()
  }
  // Placeholders never register focus targets.
  expect(status.querySelector('[data-focus-id]')).toBeNull()
})
