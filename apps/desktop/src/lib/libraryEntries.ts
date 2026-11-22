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
  if (
    isPlaceholderDescription(entry.game.description) &&
    catalog.description &&
    !isPlaceholderDescription(catalog.description)
  ) {
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

/** Disk and download size of the installation that would launch. O(installations). */
export function entrySizes(entry: LibraryEntry): {
  diskBytes: number | null
  downloadBytes: number | null
} {
  const installation = selectInstallation(entry)
  if (!installation) return { diskBytes: null, downloadBytes: null }
  return {
    diskBytes: installation.sizeBytes ?? entry.game.installSizeBytes ?? null,
    downloadBytes: installation.downloadSizeBytes ?? null,
  }
}

/** Game files Orbit downloaded itself (per-game container or legacy Steam/MS Store folder). */
export function isOrbitManagedDownload(path: string | null | undefined) {
  return Boolean(
    path?.includes('/containers/games/') ||
    path?.includes('/steam-windows/games/') ||
    path?.includes('/Orbit Games/msstore/'),
  )
}

/** Windows game files Orbit may delete: its own downloads, or a Steam library
 * folder (`steamapps/common`), never the Steam client's `steam-windows` prefix. */
function isUninstallablePath(path: string | null | undefined) {
  if (!path) return false
  if (isOrbitManagedDownload(path)) return true
  return path.includes('/steamapps/common/') && !path.includes('/steam-windows/')
}

/** The Steam app id when Orbit may uninstall this title's Windows install. */
export function uninstallAppId(entry: LibraryEntry): string | null {
  if (!entry.steamAppId) return null
  const removable = entry.installations.some(
    (item) =>
      item.available && item.launchType === 'wine' && isUninstallablePath(item.path),
  )
  return removable ? entry.steamAppId : null
}

/** The Microsoft Store 12-char product id when this entry is an MS Store title. */
export function msStoreProductId(entry: LibraryEntry): string | null {
  if (entry.game.provider !== 'ms-store') return null
  return (
    entry.game.sourceId ?? (entry.id.startsWith('msstore:') ? entry.id.slice(8) : null)
  )
}

/** Uninstall target for an Orbit-managed Steam or Microsoft Store Windows install. */
export function uninstallTarget(
  entry: LibraryEntry,
): { provider: 'steam' | 'ms-store'; id: string } | null {
  const steamId = uninstallAppId(entry)
  if (steamId) return { provider: 'steam', id: steamId }
  const productId = msStoreProductId(entry)
  if (!productId) return null
  const removable = entry.installations.some(
    (item) =>
      item.available && item.launchType === 'wine' && isUninstallablePath(item.path),
  )
  return removable ? { provider: 'ms-store', id: productId } : null
}
