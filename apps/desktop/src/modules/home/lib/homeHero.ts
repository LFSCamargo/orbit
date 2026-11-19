import { selectInstallation } from '@/lib/libraryEntries'
import type { LibraryEntry } from '@/types/library'

export function homeHero(
  entries: LibraryEntry[],
  selectedId: string | null,
): LibraryEntry | undefined {
  let latest: LibraryEntry | undefined
  for (const entry of entries) {
    if (entry.game.hidden) continue
    if (entry.id === selectedId) return entry
    const stamp = entry.game.lastPlayedAt ?? entry.game.dateAdded
    const latestStamp = latest ? (latest.game.lastPlayedAt ?? latest.game.dateAdded) : ''
    if (!latest || stamp > latestStamp) latest = entry
  }
  return latest
}

export function homeLaunchId(entry: LibraryEntry) {
  return selectInstallation(entry)?.gameId ?? entry.game.id
}
