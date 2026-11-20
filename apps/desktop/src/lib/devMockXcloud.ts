import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import type { XboxAccount, XcloudCatalog, XcloudCatalogItem } from '@/types/xcloud'

/** Browser-only stand-in for the Xbox commands: a short catalog, a device
 * code approved on the second poll, and launches that add library games. */
const CATALOG: XcloudCatalogItem[] = [
  ['9P8LR42PTRGJ', '33 Immortals'],
  ['9NGLST31DG26', 'A Game About Digging A Hole™'],
  ['9NR6NJ401NBS', 'Forza Horizon 5'],
  ['9P4NV23Q6QC2', 'Pokémon Café Mix'],
].map(([productId, title]) => ({
  productId,
  title,
  xboxTitleId: null,
  coverUrl: null,
  heroUrl: null,
  logoUrl: null,
  launchUrl: `https://www.xbox.com/en-US/play/launch/game/${productId}`,
  libraryGameId: null,
  alsoOn: [],
}))

let account: XboxAccount | null = null
let polls = 0

export function isXcloudCommand(cmd: string) {
  return (
    cmd.startsWith('xbox_device_') ||
    cmd.startsWith('xbox_account') ||
    cmd === 'xbox_sign_out' ||
    cmd.includes('xcloud')
  )
}

export function mockXcloud(
  cmd: string,
  args: Record<string, unknown> | undefined,
  games: Game[],
) {
  switch (cmd) {
    case 'xbox_device_start':
      polls = 0
      return {
        userCode: 'ORBIT123',
        verificationUri: 'https://www.microsoft.com/link',
        intervalSeconds: 1,
        expiresInSeconds: 900,
      }
    case 'xbox_device_poll':
      polls += 1
      if (polls < 2) return { done: false, account: null }
      account = { gamertag: 'Orbit Player', xuid: '1' }
      return { done: true, account }
    case 'xbox_device_cancel':
      return undefined
    case 'xbox_account_status':
      return account
    case 'xbox_sign_out':
      account = null
      return undefined
    case 'list_xcloud_catalog':
      return {
        market: 'en-US',
        fetchedAt: new Date().toISOString(),
        stale: false,
        error: null,
        items: CATALOG.map((item) => ({
          ...item,
          libraryGameId:
            games.find(
              (game) => game.provider === 'xcloud' && game.sourceId === item.productId,
            )?.id ?? null,
        })),
      } satisfies XcloudCatalog
    case 'save_xcloud_game':
    case 'launch_xcloud_game': {
      const item = CATALOG.find((entry) => entry.productId === args?.productId)
      if (!item) throw new Error('This title is not in the Xbox Cloud Gaming catalog')
      const now = new Date().toISOString()
      const existing = games.find(
        (game) => game.provider === 'xcloud' && game.sourceId === item.productId,
      )
      if (existing) {
        if (cmd === 'launch_xcloud_game') existing.lastPlayedAt = now
        return existing
      }
      const game: Game = {
        id: `xcloud-${item.productId}`,
        title: item.title,
        sortTitle: item.title.toLowerCase(),
        provider: 'xcloud',
        platform: 'cloud',
        sourceId: item.productId,
        launchConfig: { type: 'open-url', url: item.launchUrl },
        artwork: {},
        favorite: false,
        hidden: false,
        dateAdded: now,
        lastPlayedAt: cmd === 'launch_xcloud_game' ? now : undefined,
        totalPlaytimeSeconds: 0,
        achievements: [],
      }
      games.push(game)
      return game
    }
    case 'launch_xcloud_library_game': {
      const game = games.find((item) => item.id === args?.gameId)
      if (!game) throw new Error('Game not found')
      game.lastPlayedAt = new Date().toISOString()
      return game
    }
    default:
      throw new Error(`Unknown Xbox command ${cmd}`)
  }
}

/** Catalog titles not saved yet: All games only, never Installed. */
export function mockXcloudLibraryEntries(games: Game[]): LibraryEntry[] {
  const saved = new Set(
    games.filter((game) => game.provider === 'xcloud').map((game) => game.sourceId),
  )
  return CATALOG.filter((item) => !saved.has(item.productId)).map((item) => ({
    id: `xcloud:${item.productId}`,
    game: {
      id: `xcloud:${item.productId}`,
      title: item.title,
      sortTitle: item.title.toLowerCase(),
      provider: 'xcloud',
      platform: 'cloud',
      sourceId: item.productId,
      launchConfig: { type: 'open-url', url: item.launchUrl },
      artwork: {},
      favorite: false,
      hidden: false,
      dateAdded: '',
      totalPlaytimeSeconds: 0,
      achievements: [],
    },
    steamAppId: null,
    owned: false,
    installations: [],
    preferredInstallationId: null,
  }))
}
