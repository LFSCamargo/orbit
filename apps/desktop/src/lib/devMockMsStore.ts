import type { Game } from '@/types/game'
import type { LibraryEntry } from '@/types/library'
import type {
  MsStoreAccountStatus,
  MsStoreCatalog,
  MsStoreCatalogItem,
} from '@/types/msstore'

const CATALOG: MsStoreCatalogItem[] = [
  {
    productId: '9P8LR42PTRGJ',
    title: '33 Immortals',
    description: 'Co-op action roguelike for 33 players (PC Game Pass / GDK).',
    contentId: '11111111-2222-3333-4444-555555555555',
    packageFamilyName: 'ThunderLotus.33Immortals_8wekyb3d8bbwe',
    xboxTitleId: '2141212892',
    installSizeBytes: 6_400_000_000,
    coverUrl: null,
    squareUrl: null,
    heroUrl: null,
    logoUrl: null,
    owned: true,
    gamePassPc: true,
    libraryGameId: null,
    alsoOn: ['xcloud'],
  },
  {
    productId: '9NKX70BBCDRN',
    title: 'Pentiment',
    description: 'Narrative RPG set in 16th-century Bavaria (Microsoft Store PC).',
    contentId: '22222222-3333-4444-5555-666666666666',
    packageFamilyName: 'Microsoft.Pentiment_8wekyb3d8bbwe',
    xboxTitleId: '2054561781',
    installSizeBytes: 11_200_000_000,
    coverUrl: null,
    squareUrl: null,
    heroUrl: null,
    logoUrl: null,
    owned: true,
    gamePassPc: true,
    libraryGameId: null,
    alsoOn: [],
  },
]

let signedIn = false
let accountLabel: string | null = null

export function isMsStoreCommand(cmd: string): boolean {
  return (
    cmd.startsWith('msstore_') ||
    cmd === 'list_msstore_catalog' ||
    cmd === 'enqueue_msstore_download' ||
    cmd === 'uninstall_msstore_game'
  )
}

function currentStatus(): MsStoreAccountStatus {
  return {
    signedIn,
    deviceReady: signedIn,
    accountLabel,
    gamertag: signedIn ? 'Orbit Player' : null,
    xuid: signedIn ? '2533274800000001' : null,
    wineReady: true,
    xgameruntimeInstalled: true,
  }
}

export function mockMsStore(
  cmd: string,
  args: Record<string, unknown> | undefined,
  games: Game[],
) {
  switch (cmd) {
    case 'msstore_auth_status':
      return currentStatus()
    case 'msstore_auth_start':
      signedIn = true
      accountLabel = 'player@outlook.com'
      return undefined
    case 'msstore_auth_complete':
      signedIn = true
      accountLabel = (args?.accountLabel as string | null) ?? 'player@outlook.com'
      return currentStatus()
    case 'msstore_auth_cancel':
      return undefined
    case 'msstore_sign_out':
      signedIn = false
      accountLabel = null
      return undefined
    case 'list_msstore_catalog':
      return {
        market: 'en-US',
        fetchedAt: new Date().toISOString(),
        stale: false,
        error: null,
        items: CATALOG.map((item) => ({
          ...item,
          libraryGameId:
            games.find(
              (game) =>
                game.provider === 'ms-store' &&
                game.sourceId?.toUpperCase() === item.productId,
            )?.id ?? null,
        })),
      } satisfies MsStoreCatalog
    case 'enqueue_msstore_download':
      return undefined
    case 'uninstall_msstore_game': {
      const pid = String(args?.productId ?? '').toUpperCase()
      const idx = games.findIndex(
        (g) => g.provider === 'ms-store' && g.sourceId?.toUpperCase() === pid,
      )
      if (idx >= 0) games.splice(idx, 1)
      return { removedBytes: 6_400_000_000, keptPrefix: false }
    }
    default:
      throw new Error(`Unknown Microsoft Store command ${cmd}`)
  }
}

export function mockMsStoreLibraryEntries(games: Game[]): LibraryEntry[] {
  const installed = new Set(
    games
      .filter((game) => game.provider === 'ms-store')
      .map((game) => game.sourceId?.toUpperCase()),
  )
  return CATALOG.filter((item) => !installed.has(item.productId)).map((item) => ({
    id: `msstore:${item.productId}`,
    game: {
      id: `msstore:${item.productId}`,
      title: item.title,
      sortTitle: item.title.toLowerCase(),
      description: item.description ?? undefined,
      provider: 'ms-store',
      platform: 'windows',
      sourceId: item.productId,
      launchConfig: {
        type: 'wine',
        profile: {
          runtimePath: '',
          executable: '',
          arguments: [],
          environment: {},
        },
      },
      artwork: {
        cover: item.coverUrl ?? undefined,
        hero: item.heroUrl ?? undefined,
        logo: item.logoUrl ?? undefined,
        icon: item.squareUrl ?? undefined,
      },
      favorite: false,
      hidden: false,
      dateAdded: '',
      totalPlaytimeSeconds: 0,
      installSizeBytes: item.installSizeBytes ?? undefined,
      achievements: [],
    },
    steamAppId: null,
    owned: item.owned || item.gamePassPc,
    installations: [],
    preferredInstallationId: null,
  }))
}
