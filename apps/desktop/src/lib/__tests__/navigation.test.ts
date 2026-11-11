import { describe, expect, it } from 'vitest'
import {
  backTarget,
  focusRestoreId,
  resolveNavScreen,
  screenEntryFocusId,
} from '@/lib/navigation'
import type { AppScreen } from '@/types/game'

describe('resolveNavScreen', () => {
  it('maps detail and settings sub-screens to their shells', () => {
    expect(resolveNavScreen('game-details')).toBe('library')
    expect(resolveNavScreen('add-game')).toBe('settings')
    expect(resolveNavScreen('game-edit')).toBe('settings')
    expect(resolveNavScreen('switch-library')).toBe('settings')
  })

  it('passes through top-level screens', () => {
    const screens: AppScreen[] = ['home', 'library', 'search', 'settings']
    for (const screen of screens) {
      expect(resolveNavScreen(screen)).toBe(screen)
    }
  })
})

describe('backTarget', () => {
  it('returns game-details from game-edit', () => {
    expect(backTarget('game-edit', 'library')).toBe('game-details')
  })

  it('returns settings from add-game and switch-library', () => {
    expect(backTarget('add-game', 'home')).toBe('settings')
    expect(backTarget('switch-library', 'home')).toBe('settings')
  })

  it('uses previous for game-details unless previous is also game-details', () => {
    expect(backTarget('game-details', 'search')).toBe('search')
    expect(backTarget('game-details', 'library')).toBe('library')
    expect(backTarget('game-details', 'game-details')).toBe('library')
    expect(backTarget('game-details', 'game-edit')).toBe('library')
  })

  it('stays on home from home and defaults others to home', () => {
    expect(backTarget('home', 'library')).toBe('home')
    expect(backTarget('library', 'search')).toBe('home')
    expect(backTarget('settings', 'home')).toBe('home')
  })
})

describe('focusRestoreId', () => {
  it('returns null without a game id', () => {
    expect(focusRestoreId('library', null)).toBeNull()
  })

  it('builds library, search, and home focus ids', () => {
    expect(focusRestoreId('library', 'g1')).toBe('library-game-g1')
    expect(focusRestoreId('search', 'g1')).toBe('search-game-g1')
    expect(focusRestoreId('home', 'g1')).toBe('macos-game-g1')
  })

  it('returns null for screens without restore targets', () => {
    expect(focusRestoreId('settings', 'g1')).toBeNull()
    expect(focusRestoreId('game-details', 'g1')).toBeNull()
  })
})

describe('screenEntryFocusId', () => {
  it('returns entry focus for shell routes', () => {
    expect(screenEntryFocusId('home')).toBe('macos-play')
    expect(screenEntryFocusId('library')).toBe('library-sort-alphabetical')
    expect(screenEntryFocusId('search')).toBe('search-clear')
    expect(screenEntryFocusId('settings')).toBe('settings-fullscreen')
    expect(screenEntryFocusId('switch-library')).toBe('switch-library-scan')
  })

  it('returns null for non-shell screens', () => {
    expect(screenEntryFocusId('game-details')).toBeNull()
    expect(screenEntryFocusId('add-game')).toBeNull()
  })
})
