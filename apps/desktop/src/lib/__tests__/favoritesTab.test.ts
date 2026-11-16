import { expect, it } from 'vitest'
import { fallbackHomeView, fallbackLibraryView, showFavoritesTab } from '../favoritesTab'

it('hides the Favorites tab when the user has no favorites', () => {
  expect(
    showFavoritesTab({
      hasFavorites: false,
      probeReady: true,
      viewingFavorites: false,
    }),
  ).toBe(false)
})

it('shows the Favorites tab once at least one game is marked favorite', () => {
  expect(
    showFavoritesTab({
      hasFavorites: true,
      probeReady: true,
      viewingFavorites: false,
    }),
  ).toBe(true)
})

it('keeps the Favorites tab while the current view is Favorites and the probe is still loading', () => {
  expect(
    showFavoritesTab({
      hasFavorites: false,
      probeReady: false,
      viewingFavorites: true,
    }),
  ).toBe(true)
})

it('leaves Recent or Installed when the last favorite is removed', () => {
  expect(fallbackHomeView('favorites', false, true)).toBe('recent')
  expect(fallbackLibraryView('favorites', false, true)).toBe('installed')
  expect(fallbackHomeView('favorites', false, false)).toBeNull()
  expect(fallbackHomeView('recent', false, true)).toBeNull()
  expect(fallbackLibraryView('all', false, true)).toBeNull()
})
