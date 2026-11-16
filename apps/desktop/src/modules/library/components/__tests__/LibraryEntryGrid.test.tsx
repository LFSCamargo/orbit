import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { focusManager } from '@/controllers/FocusManager'
import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import { LibraryEntryGrid } from '../LibraryEntryGrid'

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
