import { useLibrary } from './useLibrary'

const FAVORITES_PROBE = { view: 'favorites' as const, limit: 1 }

/** O(1) bounded probe: one library page of a single favorites row. */
export function useHasFavorites() {
  const query = useLibrary(FAVORITES_PROBE)
  return {
    hasFavorites: (query.data?.pages[0]?.total ?? 0) > 0,
    isReady: query.isSuccess,
  }
}
