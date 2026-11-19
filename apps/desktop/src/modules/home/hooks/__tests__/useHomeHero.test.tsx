import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useHomeHero } from '../useHomeHero'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'
import type { Game } from '@/types/game'

const selected = vi.hoisted(() => ({ data: undefined as LibraryEntry | undefined }))

vi.mock('@/hooks/useLibrary', () => ({
  useLibraryEntry: () => selected,
}))

function entry(id: string, extra: Partial<Game> = {}): LibraryEntry {
  return {
    id,
    steamAppId: id.startsWith('steam:') ? id.slice(6) : null,
    owned: true,
    preferredInstallationId: null,
    installations: [],
    game: {
      id,
      title: extra.title ?? id,
      sortTitle: extra.title ?? id,
      provider: 'steam',
      platform: 'macos',
      launchConfig: { type: 'steam', appId: '1' },
      artwork: extra.artwork ?? { hero: `https://cdn.example/${id}-hero.jpg` },
      favorite: false,
      hidden: false,
      dateAdded: extra.dateAdded ?? '2026-01-01T00:00:00Z',
      lastPlayedAt: extra.lastPlayedAt,
      totalPlaytimeSeconds: 0,
      achievements: [],
      ...extra,
    },
  }
}

afterEach(() => {
  cleanup()
  selected.data = undefined
  useUiStore.setState({ heroGameId: null })
})

it('keeps the selected game when it is missing from the first library page', () => {
  const league = entry('steam:lol', {
    title: 'League of Legends',
    lastPlayedAt: '2026-11-01T00:00:00Z',
  })
  const resident = entry('steam:883710', {
    title: 'Resident Evil 2',
    dateAdded: '2026-02-01T00:00:00Z',
  })
  selected.data = resident
  useUiStore.setState({ heroGameId: resident.id })
  const { result } = renderHook(() => useHomeHero([league]))
  expect(result.current?.id).toBe(resident.id)
  expect(result.current?.game.title).toBe('Resident Evil 2')
})

it('falls back to the latest listed game when nothing is selected', () => {
  const older = entry('steam:10', {
    title: 'Portal',
    lastPlayedAt: '2026-01-01T00:00:00Z',
  })
  const recent = entry('steam:1091500', {
    title: 'Cyberpunk 2077',
    lastPlayedAt: '2026-11-01T00:00:00Z',
  })
  const { result } = renderHook(() => useHomeHero([older, recent]))
  expect(result.current?.id).toBe(recent.id)
})
