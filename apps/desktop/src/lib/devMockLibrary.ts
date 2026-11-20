import type { Game } from '@/types/game'
import type {
  LibraryEntry,
  LibraryEntryPatch,
  LibraryPageResult,
  LibraryQuery,
} from '@/types/library'
import type { SteamOwnedGame } from '@/types/steam'
import { overlayCatalogCopy } from './libraryEntries'

const states = new Map<string, LibraryEntryPatch>()
export function mockLibrary(games: Game[], catalog: SteamOwnedGame[]): LibraryEntry[] {
  const entries = new Map<string, LibraryEntry>()
  for (const game of games) {
    const appId =
      game.launchConfig.type === 'steam'
        ? game.launchConfig.appId
        : game.provider === 'steam'
          ? game.sourceId
          : undefined
    const id = appId ? `steam:${appId}` : game.id
    const installation = {
      id: game.id,
      gameId: game.id,
      platform: game.platform,
      available: true,
      path: null,
      launchType: game.launchConfig.type,
    }
    const found = entries.get(id)
    if (found) found.installations.push(installation)
    else
      entries.set(id, {
        id,
        game: { ...game },
        steamAppId: appId ?? null,
        owned: false,
        installations: [installation],
        preferredInstallationId: null,
      })
  }
  for (const item of catalog) {
    const id = `steam:${item.appId}`
    const found = entries.get(id)
    if (found) {
      overlayCatalogCopy(found, {
        description: item.description,
        minimumRequirements: item.minimumRequirements,
        recommendedRequirements: item.recommendedRequirements,
        protonTier: item.protonTier,
      })
      continue
    }
    entries.set(id, {
      id,
      owned: true,
      steamAppId: item.appId,
      preferredInstallationId: null,
      installations: [],
      runInfo:
        item.minimumRequirements || item.recommendedRequirements || item.protonTier
          ? {
              minimum: item.minimumRequirements ?? null,
              recommended: item.recommendedRequirements ?? null,
              protonTier: item.protonTier ?? null,
            }
          : null,
      game: {
        id,
        title: item.title,
        sortTitle: item.title.toLowerCase(),
        description: item.description ?? undefined,
        provider: 'steam',
        platform: 'windows',
        sourceId: item.appId,
        launchConfig: { type: 'steam', appId: item.appId },
        artwork: { cover: item.coverUrl, hero: item.heroUrl },
        favorite: false,
        hidden: false,
        dateAdded: '',
        totalPlaytimeSeconds: 0,
        achievements: [],
      },
    })
  }
  for (const entry of entries.values()) {
    const patch = states.get(entry.id)
    if (patch?.favorite !== undefined) entry.game.favorite = patch.favorite
    if (patch?.hidden !== undefined) entry.game.hidden = patch.hidden
    entry.preferredInstallationId = patch?.preferredInstallationId ?? null
  }
  return [...entries.values()].sort((a, b) => a.game.title.localeCompare(b.game.title))
}
/** Same rule as Rust's `search_text::search_key`: accents and symbols ignored. */
function searchKey(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function mockLibraryPage(
  entries: LibraryEntry[],
  query: LibraryQuery,
): LibraryPageResult {
  const filtered = entries.filter(
    (e) =>
      !e.game.hidden &&
      searchKey(e.game.title).includes(searchKey(query.query ?? '')) &&
      (query.view === 'all' ||
        (query.view === 'favorites' ? e.game.favorite : e.installations.length > 0)) &&
      (!query.platform ||
        query.platform === 'all' ||
        e.installations.some((i) => i.platform === query.platform)),
  )
  if (query.sort === 'recently-played')
    filtered.sort((a, b) =>
      (b.game.lastPlayedAt ?? '').localeCompare(a.game.lastPlayedAt ?? ''),
    )
  if (query.sort === 'playtime')
    filtered.sort((a, b) => b.game.totalPlaytimeSeconds - a.game.totalPlaytimeSeconds)
  const start = query.cursor ?? 0,
    size = Math.min(query.limit ?? 48, 96)
  return {
    entries: filtered.slice(start, start + size),
    total: filtered.length,
    nextCursor: start + size < filtered.length ? start + size : null,
  }
}
export function mockUpdateLibrary(id: string, patch: LibraryEntryPatch) {
  states.set(id, { ...states.get(id), ...patch })
}
