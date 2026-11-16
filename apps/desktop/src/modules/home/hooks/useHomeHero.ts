import { useMemo } from 'react'
import { useLibraryEntry } from '@/hooks/useLibrary'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'
import { homeHero } from '../lib/homeHero'

const NO_EXTRA: LibraryEntry[] = []

/** Resolve the home hero from the selected entry, not just the first library page. */
export function useHomeHero(entries: LibraryEntry[], extra: LibraryEntry[] = NO_EXTRA) {
  const heroGameId = useUiStore((s) => s.heroGameId)
  const selected = useLibraryEntry(heroGameId)
  return useMemo(
    () =>
      homeHero(
        [...(selected.data ? [selected.data] : []), ...extra, ...entries],
        heroGameId,
      ),
    [entries, extra, heroGameId, selected.data],
  )
}
