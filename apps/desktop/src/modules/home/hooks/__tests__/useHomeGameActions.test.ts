import { expect, it, vi } from 'vitest'
import type { LibraryEntry } from '@/types/library'
import { createHomeGameHandlers } from '../useHomeGameActions'

function entry(available: boolean): LibraryEntry {
  return {
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
        available,
        launchType: 'steam',
      },
    ],
    game: { id: 'g1', title: 'RE2' },
  } as unknown as LibraryEntry
}

it('never launches the hero game when it is not on this Mac', () => {
  const onPlay = vi.fn()
  const { activateGame } = createHomeGameHandlers(
    null,
    vi.fn(),
    onPlay,
    vi.fn(),
    'steam:883710',
  )
  activateGame(entry(false))
  expect(onPlay).not.toHaveBeenCalled()
  activateGame(entry(true))
  expect(onPlay).toHaveBeenCalledOnce()
})
