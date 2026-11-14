import type { LibraryEntry, LibraryRunInfo } from '@/types/library'

export function isPlaceholderDescription(value?: string | null) {
  const text = value?.trim()
  if (!text) return true
  const lower = text.toLowerCase()
  return (
    lower.startsWith('imported from') ||
    lower.startsWith('gamehub shortcut') ||
    lower.startsWith('manually added')
  )
}

export function overlayCatalogCopy(
  entry: LibraryEntry,
  catalog: {
    description?: string | null
    minimumRequirements?: string | null
    recommendedRequirements?: string | null
    protonTier?: string | null
  },
) {
  entry.owned = true
  if (isPlaceholderDescription(entry.game.description) && catalog.description) {
    entry.game.description = catalog.description
  }
  const runInfo: LibraryRunInfo = {
    minimum: catalog.minimumRequirements ?? null,
    recommended: catalog.recommendedRequirements ?? null,
    protonTier: catalog.protonTier ?? null,
  }
  if (!entry.runInfo && (runInfo.minimum || runInfo.recommended || runInfo.protonTier)) {
    entry.runInfo = runInfo
  }
  return entry
}

export function selectInstallation(entry: LibraryEntry) {
  if (entry.preferredInstallationId)
    return entry.installations.find((item) => item.id === entry.preferredInstallationId)
  return entry.installations.find((item) => item.available) ?? entry.installations[0]
}

export function entryInstallStatus(entry: LibraryEntry) {
  const installation = selectInstallation(entry)
  if (installation?.available) return 'installed' as const
  if (installation) return 'unavailable' as const
  return 'not-installed' as const
}

export function entryCanSave(entry: LibraryEntry) {
  return entry.installations.some((item) => !item.gameId.startsWith('steam:'))
}
