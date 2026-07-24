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
  })

  it('stays on home from home and defaults others to home', () => {
    expect(backTarget('home', 'library')).toBe('home')
    expect(backTarget('library', 'search')).toBe('home')
    expect(backTarget('settings', 'home')).toBe('home')
  })
})

describe('focusRestoreId', () => {
  it('returns null without a game id', () => {
    expect(focusRestoreId('orbit', 'library', null)).toBeNull()
  })

  it('builds library and search focus ids', () => {
    expect(focusRestoreId('orbit', 'library', 'g1')).toBe('library-game-g1')
    expect(focusRestoreId('orbit', 'search', 'g1')).toBe('search-game-g1')
  })

  it('builds home focus ids by layout and provider', () => {
    expect(focusRestoreId('switch', 'home', 'g1')).toBe('switch-game-g1')
    expect(focusRestoreId('ps5', 'home', 'g1')).toBe('ps5-tile-g1')
    expect(focusRestoreId('orbit', 'home', 'g1', null, '2026-01-01')).toBe(
      'orbit-recent-g1',
    )
    expect(focusRestoreId('orbit', 'home', 'g1', 'astris')).toBe('orbit-switch-g1')
    expect(focusRestoreId('orbit', 'home', 'g1', 'gamehub')).toBe('orbit-gamehub-g1')
    expect(focusRestoreId('orbit', 'home', 'g1', 'steam')).toBe('orbit-steam-g1')
    expect(focusRestoreId('orbit', 'home', 'g1', 'manual')).toBe('orbit-recent-g1')
  })

  it('returns null for screens without restore targets', () => {
    expect(focusRestoreId('orbit', 'settings', 'g1')).toBeNull()
    expect(focusRestoreId('orbit', 'game-details', 'g1')).toBeNull()
  })
})

describe('screenEntryFocusId', () => {
  it('returns layout-specific home entry focus', () => {
    expect(screenEntryFocusId('ps5', 'home')).toBe('ps5-play')
    expect(screenEntryFocusId('switch', 'home')).toBe('switch-home-play')
    expect(screenEntryFocusId('orbit', 'home')).toBe('orbit-play')
  })

  it('returns fixed entry focus for shell routes', () => {
    expect(screenEntryFocusId('orbit', 'library')).toBe('library-sort-alphabetical')
    expect(screenEntryFocusId('orbit', 'search')).toBe('search-clear')
    expect(screenEntryFocusId('orbit', 'settings')).toBe('settings-fullscreen')
    expect(screenEntryFocusId('orbit', 'switch-library')).toBe('switch-library-scan')
  })

  it('returns null for non-shell screens', () => {
    expect(screenEntryFocusId('orbit', 'game-details')).toBeNull()
    expect(screenEntryFocusId('orbit', 'add-game')).toBeNull()
  })
})
