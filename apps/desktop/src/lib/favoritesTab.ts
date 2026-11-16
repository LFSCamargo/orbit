export function showFavoritesTab({
  hasFavorites,
  probeReady,
  viewingFavorites,
}: {
  hasFavorites: boolean
  probeReady: boolean
  viewingFavorites: boolean
}): boolean {
  if (hasFavorites) return true
  return !probeReady && viewingFavorites
}

export function fallbackHomeView(
  view: 'recent' | 'installed' | 'favorites',
  hasFavorites: boolean,
  probeReady: boolean,
): 'recent' | null {
  if (probeReady && !hasFavorites && view === 'favorites') return 'recent'
  return null
}

export function fallbackLibraryView(
  view: 'installed' | 'all' | 'favorites',
  hasFavorites: boolean,
  probeReady: boolean,
): 'installed' | null {
  if (probeReady && !hasFavorites && view === 'favorites') return 'installed'
  return null
}
