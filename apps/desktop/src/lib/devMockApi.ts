import { mockLibrary, mockLibraryPage, mockUpdateLibrary } from './devMockLibrary'
import type { LibraryQuery, LibraryEntryPatch } from '@/types/library'
import type { InstallLocation } from '@/types/downloads'
import type { SteamOwnedGame } from '@/types/steam'
import type { SteamWindowsPreferences } from '@/types/steam'
import { localThemeArtwork } from './bundledArtwork'
import { isXcloudCommand, mockXcloud, mockXcloudLibraryEntries } from './devMockXcloud'
import type { Game, GameSession } from '@/types/game'
import type { ThemeDefinition } from '@/themes/types'
import { BUILT_IN_THEMES, DEFAULT_THEME_ID } from '@/themes/catalog'

let steamAccount: string | null = null
let steamQrPolls = 0
let steamLoginPolls = 0
let steamPreferences: SteamWindowsPreferences = {
  offlineMode: false,
  verifyFiles: true,
  steamInput: false,
  steamOverlay: false,
}
let mockInstallLocations: InstallLocation[] = [
  {
    id: 'this-mac',
    label: 'This Mac',
    path: null,
    available: true,
    freeBytes: 120_000_000_000,
    totalBytes: 494_000_000_000,
    isDefault: true,
    gameCount: 0,
  },
]

function mockStorageOverview() {
  const items = [
    {
      id: 'game:730',
      name: 'Counter-Strike 2',
      kind: 'game',
      sizeBytes: 34_600_000_000,
      installedAt: '2026-11-10T12:00:00.000Z',
      path: '/Orbit/runtimes/containers/games/steam-730/install',
      artwork: 'https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900_2x.jpg',
      removal: { type: 'game', appId: '730' },
      entryId: 'steam:730',
      source: 'Orbit',
      onDataVolume: true,
      driveId: 'this-mac',
    },
    {
      id: 'tool:steam-windows:prefix',
      name: 'Steam for Windows',
      kind: 'tool',
      sizeBytes: 2_400_000_000,
      installedAt: '2026-11-03T12:00:00.000Z',
      path: '/Orbit/steam-windows/prefix',
      artwork: null,
      removal: { type: 'orbitData', paths: ['/Orbit/steam-windows/prefix'] },
      entryId: null,
      source: 'Orbit',
      onDataVolume: true,
      driveId: 'this-mac',
    },
    {
      id: 'component:dxvk:2.3',
      name: 'DXVK 2.3',
      kind: 'runtime',
      sizeBytes: 120_000_000,
      installedAt: '2026-10-28T12:00:00.000Z',
      path: '/Orbit/runtimes/components/dxvk/2.3',
      artwork: null,
      removal: { type: 'component', id: 'dxvk', version: '2.3' },
      entryId: null,
      source: 'Orbit',
      onDataVolume: true,
      driveId: 'this-mac',
    },
    {
      id: 'other:artwork-cache',
      name: 'Artwork cache',
      kind: 'other',
      sizeBytes: 161_000_000,
      installedAt: null,
      path: '/Orbit/artwork-cache',
      artwork: null,
      removal: { type: 'orbitData', paths: ['/Orbit/artwork-cache'] },
      entryId: null,
      source: 'Orbit',
      onDataVolume: true,
      driveId: 'this-mac',
    },
  ]
  const sum = (kind: string) =>
    items
      .filter((item) => item.kind === kind)
      .reduce((total, item) => total + item.sizeBytes, 0)
  const totals = {
    games: sum('game'),
    tools: sum('tool'),
    runtimes: sum('runtime'),
    other: sum('other'),
  }
  const orbitBytes = totals.games + totals.tools + totals.runtimes + totals.other
  const drives = [
    {
      id: 'this-mac',
      name: 'This Mac',
      mountPath: '/',
      isDataVolume: true,
      totalBytes: 500_000_000_000,
      freeBytes: 120_000_000_000,
      orbitBytes,
      totals,
    },
    {
      id: '/Volumes/T7',
      name: 'T7',
      mountPath: '/Volumes/T7',
      isDataVolume: false,
      totalBytes: 1_000_000_000_000,
      freeBytes: 640_000_000_000,
      orbitBytes: 0,
      totals: { games: 0, tools: 0, runtimes: 0, other: 0 },
    },
  ]
  return {
    volumeTotalBytes: drives.reduce((total, drive) => total + drive.totalBytes, 0),
    volumeFreeBytes: drives.reduce((total, drive) => total + drive.freeBytes, 0),
    orbitBytes,
    totals,
    drives,
    items,
    truncated: false,
    scannedAt: '2026-11-17T12:00:00.000Z',
  }
}

function steamStatus() {
  return {
    signedIn: steamAccount !== null,
    accountName: steamAccount,
    steamInstalled: false,
    clientRunning: false,
    clientLoggedIn: steamAccount !== null,
    clientPhase: steamAccount ? 'ready' : 'stopped',
    clientCaption: steamAccount ? 'Steam is ready' : '',
    ownedCount: steamAccount ? 2 : 0,
    sessionReady: steamAccount !== null,
  }
}

const LIGHT_HERO_ART =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#eef1f6"/><stop offset="42%" stop-color="#d8dde6"/><stop offset="100%" stop-color="#c2cad6"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>',
  )

const MOCK_GAMES: Game[] = [
  {
    id: 'mock-cyberpunk',
    title: 'Cyberpunk 2077',
    sortTitle: 'cyberpunk 2077',
    description: 'An open-world RPG in Night City.',
    provider: 'steam',
    platform: 'macos',
    launchConfig: { type: 'steam', appId: '1091500' },
    artwork: {
      cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2rpf.jpg',
      hero: 'https://images.igdb.com/igdb/image/upload/t_1080p/co2rpf.jpg',
      icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2rpf.jpg',
    },
    favorite: true,
    hidden: false,
    dateAdded: '2026-01-10T12:00:00.000Z',
    lastPlayedAt: '2026-03-15T18:00:00.000Z',
    totalPlaytimeSeconds: 4140,
    installSizeBytes: 90_000_000_000,
    achievements: [
      { id: 'a1', name: 'The Streetkid', unlocked: true },
      { id: 'a2', name: 'Legend', unlocked: false },
    ],
  },
  {
    id: 'mock-re4',
    title: 'Resident Evil 4',
    sortTitle: 'resident evil 4',
    description: 'Survival horror classic remade.',
    provider: 'steam',
    platform: 'macos',
    launchConfig: { type: 'steam', appId: '2050650' },
    artwork: {
      icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg',
      cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg',
    },
    favorite: false,
    hidden: false,
    dateAdded: '2026-02-01T12:00:00.000Z',
    lastPlayedAt: '2026-03-10T12:00:00.000Z',
    totalPlaytimeSeconds: 7200,
    installSizeBytes: 60_000_000_000,
    achievements: [],
  },
  {
    id: 'mock-requiem',
    title: 'Resident Evil Requiem',
    sortTitle: 'resident evil requiem',
    description: 'Survival horror on macOS.',
    provider: 'native',
    platform: 'macos',
    launchConfig: { type: 'open-file', filePath: '/Games/Requiem.app' },
    artwork: {
      hero: LIGHT_HERO_ART,
      cover: LIGHT_HERO_ART,
      icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg',
    },
    favorite: false,
    hidden: false,
    dateAdded: '2026-03-01T12:00:00.000Z',
    totalPlaytimeSeconds: 0,
    installSizeBytes: 2_900_000,
    achievements: [],
  },
  {
    id: 'mock-zelda',
    title: 'The Legend of Zelda',
    sortTitle: 'legend of zelda',
    provider: 'astris',
    platform: 'nintendo-switch',
    launchConfig: { type: 'open-file', filePath: '/Games/Zelda.nsp' },
    artwork: {
      icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co3w26.jpg',
    },
    favorite: false,
    hidden: false,
    dateAdded: '2026-02-20T12:00:00.000Z',
    totalPlaytimeSeconds: 0,
    achievements: [],
  },
]

let games = [...MOCK_GAMES]
let activeSession: GameSession | null = null
const customThemes = new Map<string, ThemeDefinition>()

const settings = new Map<string, unknown>([
  ['themeId', DEFAULT_THEME_ID],
  ['rawgApiKey', ''],
  ['theGamesDbApiKey', ''],
  ['steamGridDbApiKey', ''],
])

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function mockInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isXcloudCommand(cmd)) return mockXcloud(cmd, args, games) as T
  switch (cmd) {
    case 'list_library_entries':
    case 'get_library_entry': {
      const catalog = await mockInvoke<SteamOwnedGame[]>('steam_windows_library')
      const query = (args?.query ?? {}) as LibraryQuery
      const entries = [
        ...mockLibrary(games, catalog),
        ...(cmd === 'get_library_entry' || query.includeCloudCatalog
          ? mockXcloudLibraryEntries(games)
          : []),
      ]
      return (
        cmd === 'get_library_entry'
          ? (entries.find(
              (e) =>
                e.id === args?.entryId ||
                e.installations.some((i) => i.gameId === args?.entryId) ||
                // A saved cloud title keeps its catalog id (as in Rust).
                (e.game.provider === 'xcloud' &&
                  `xcloud:${e.game.sourceId}` === args?.entryId),
            ) ?? null)
          : mockLibraryPage(entries, query)
      ) as T
    }
    case 'update_library_entry':
      mockUpdateLibrary(String(args?.entryId), args?.patch as LibraryEntryPatch)
      return undefined as T
    case 'delete_library_entry': {
      const catalog = await mockInvoke<SteamOwnedGame[]>('steam_windows_library')
      const entry = mockLibrary(games, catalog).find((item) => item.id === args?.entryId)
      if (entry) {
        const ids = new Set(entry.installations.map((item) => item.gameId))
        games = games.filter((game) => !ids.has(game.id))
      }
      return undefined as T
    }
    case 'reveal_path':
      return undefined as T
    case 'scan_steam_installations':
      return { imported: 0, enriched: 0, provider: 'steam' } as T
    case 'scan_steam_library':
      return { imported: 0, enriched: 0, provider: 'steam' } as T
    case 'scan_native_apps':
      return { imported: 0, enriched: 0, provider: 'native' } as T
    case 'install_steam_game':
    case 'open_steam_library':
      return undefined as T
    case 'list_games':
      return games.filter((g) => !g.hidden) as T
    case 'get_game': {
      const gameId = args?.gameId as string
      return (games.find((g) => g.id === gameId) ?? null) as T
    }
    case 'windows_compatibility':
      return {
        supported: true,
        managed: null,
        package: { version: '11.0.1', downloadBytes: 185_303_032 },
      } as T
    case 'install_windows_compatibility':
      throw new Error('Managed downloads require the Orbit desktop app.')
    case 'orbit_wine_status':
      return null as T
    case 'install_orbit_wine':
      throw new Error('Managed downloads require the Orbit desktop app.')
    case 'compatibility_catalog':
      return {
        fetchedAt: new Date().toISOString(),
        warnings: [],
        components: (
          [
            ['wine-stable', 'Wine Stable', 'Wine', ['11.0_1', '10.0_3'], true],
            ['wine-devel', 'Wine Development', 'Wine', ['11.7', '11.6_1'], true],
            ['wine-staging', 'Wine Staging', 'Wine', ['11.7', '11.6_1'], true],
            [
              'dxvk',
              'DirectX 10/11 graphics',
              'DXVK-macOS',
              ['v1.10.3-20230507-repack'],
              true,
            ],
            ['dxmt', 'DirectX 11 graphics', 'DXMT', ['v0.80', 'v0.74', 'v0.73'], true],
            ['moltenvk', 'Vulkan on Metal', 'MoltenVK', ['v1.4.2', 'v1.4.1-rc1'], true],
            [
              'gptk',
              'DirectX 11/12 graphics',
              'Apple GPTK',
              [
                'Game-Porting-Toolkit-3.0-3',
                'Game-Porting-Toolkit-3.0-beta4',
                'Game-Porting-Toolkit-2.1',
                'Game-Porting-Toolkit-1.1',
              ],
              false,
            ],
          ] as const
        ).map(([id, name, technology, versions, downloadable]) => ({
          id,
          name,
          technology,
          sourceUrl: 'https://github.com',
          distribution:
            id === 'gptk'
              ? 'Community packages · Apple license required'
              : 'Official builds',
          downloadable: id === 'gptk' ? true : downloadable,
          versions:
            id === 'gptk'
              ? [
                  {
                    version: '1.1 · Apple official via Homebrew',
                    prerelease: false,
                    asset: { name: '', url: '', size: 0, sha256: null },
                    homebrewFormula: {
                      tap: 'apple/apple',
                      name: 'game-porting-toolkit',
                      version: '1.1',
                      fullName: 'apple/apple/game-porting-toolkit',
                    },
                    localPackage: null,
                  },
                  ...versions.map((tag) => ({
                    version: tag,
                    prerelease: tag.toLowerCase().includes('beta'),
                    asset: {
                      name: `${tag.toLowerCase()}.tar.xz`,
                      url: 'https://github.com',
                      size: 239_200_808,
                      sha256: null,
                    },
                    homebrewFormula: null,
                    localPackage: null,
                  })),
                  {
                    version: '4.0 beta 3 · Apple download (evaluation)',
                    prerelease: true,
                    asset: {
                      name: 'Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
                      url: '',
                      size: 26_630_502,
                      sha256: null,
                    },
                    homebrewFormula: null,
                    localPackage: {
                      path: '/Users/demo/Downloads/Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
                      file: 'Evaluation_environment_for_Windows_games_4.0_beta_3.dmg',
                      version: '4.0 beta 3',
                      kind: 'evaluation',
                      sizeBytes: 26_630_502,
                      digestVerified: true,
                    },
                  },
                  {
                    version: '4.0 beta 3 · Apple download (complete)',
                    prerelease: true,
                    asset: {
                      name: 'Game_Porting_Toolkit_4.0_beta_3.dmg',
                      url: '',
                      size: 104_666_842,
                      sha256: null,
                    },
                    homebrewFormula: null,
                    localPackage: {
                      path: '/Users/demo/Downloads/Game_Porting_Toolkit_4.0_beta_3.dmg',
                      file: 'Game_Porting_Toolkit_4.0_beta_3.dmg',
                      version: '4.0 beta 3',
                      kind: 'complete',
                      sizeBytes: 104_666_842,
                      digestVerified: true,
                    },
                  },
                ]
              : versions.map((version) => ({
                  version,
                  prerelease:
                    version.toLowerCase().includes('beta') || version.includes('rc'),
                  asset: {
                    name: `${id}-${version}.tar.gz`,
                    url: 'https://github.com',
                    size: 1_000_000,
                    sha256: null,
                  },
                  homebrewFormula: null,
                  localPackage: null,
                })),
        })),
      } as T
    case 'install_component':
      throw new Error('Managed downloads require the Orbit desktop app.')
    case 'component_status':
      return [] as T
    case 'active_components':
      return {
        ...(settings.get('windows-compatibility-active-components-v1') ?? {}),
      } as T
    case 'set_active_component': {
      const actives = {
        ...((settings.get('windows-compatibility-active-components-v1') ?? {}) as Record<
          string,
          string
        >),
        [String(args?.component)]: String(args?.version),
      }
      settings.set('windows-compatibility-active-components-v1', actives)
      return actives as T
    }
    case 'component_views':
      return {
        ...((settings.get('windows-compatibility-component-views-v1') ?? {}) as Record<
          string,
          string
        >),
      } as T
    case 'set_component_view': {
      const views = {
        ...((settings.get('windows-compatibility-component-views-v1') ?? {}) as Record<
          string,
          string
        >),
        [String(args?.group)]: String(args?.key),
      }
      settings.set('windows-compatibility-component-views-v1', views)
      return views as T
    }
    case 'install_gptk_via_homebrew':
      throw new Error('Homebrew installation requires the Orbit desktop app.')
    case 'install_local_gptk_package':
      throw new Error('Local Apple package import requires the Orbit desktop app.')
    case 'register_component_path':
      throw new Error('Component registration requires the Orbit desktop app.')
    case 'compatibility_settings': {
      const current = (settings.get('windows-compatibility-settings-v1') ?? {
        graphics: 'auto',
        synchronization: 'msync',
        retinaMode: false,
        metalHud: false,
        avx: true,
        upscaling: true,
        upscaleRatio: 0,
        frameGeneration: false,
        frameGenerationVsync: false,
        frameRateLimit: null,
        dxmtNvidiaExtensions: false,
        resolution: 'custom',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
      }) as Record<string, unknown>
      return {
        ...current,
        resolution: 'custom',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        retinaMode: false,
      } as T
    }
    case 'update_compatibility_settings': {
      const next = {
        ...(args?.settings as Record<string, unknown>),
        resolution: 'custom',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
        retinaMode: false,
      }
      settings.set('windows-compatibility-settings-v1', next)
      return next as T
    }
    case 'detect_runtimes':
      return [] as T
    case 'register_wine_runtime':
      throw new Error('Runtime detection requires the Orbit desktop app.')
    case 'runtime_diagnostics':
      return 'Runtime logs are available in the Orbit desktop app.' as T
    case 'cancel_game_launch':
      return undefined as T
    case 'get_active_session':
      return activeSession as T
    case 'get_setting': {
      const key = args?.key as string
      return (settings.get(key) ?? null) as T
    }
    case 'set_setting': {
      const key = args?.key as string
      settings.set(key, args?.value)
      return undefined as T
    }
    case 'pick_open_path':
      return null as T
    case 'enrich_game_metadata': {
      const gameId = args?.gameId as string
      games = games.map((g) =>
        g.id === gameId
          ? {
              ...g,
              description:
                g.description && !g.description.startsWith('Imported')
                  ? g.description
                  : 'An open-world adventure enriched for Orbit.',
              artwork: {
                ...g.artwork,
                cover:
                  g.artwork.cover ??
                  'https://images.igdb.com/igdb/image/upload/t_cover_big/co2rpf.jpg',
                hero:
                  g.artwork.hero ??
                  'https://images.igdb.com/igdb/image/upload/t_1080p/co2rpf.jpg',
              },
            }
          : g,
      )
      return {
        enriched: true,
        message: 'Updated TheGamesDB metadata · SteamGridDB artwork',
      } as T
    }
    case 'enrich_games_metadata':
      return { enriched: (args?.gameIds as string[] | undefined)?.length ?? 0 } as T
    case 'get_metadata_cache_stats':
      return {
        gameCount: 12,
        dbPath: '/mock/metadata.sqlite',
      } as T
    case 'test_metadata_api_keys':
      return {
        thegamesdbOk: true,
        steamgriddbOk: true,
        message: 'TheGamesDB connected · SteamGridDB connected',
      } as T
    case 'list_custom_themes':
      return [...customThemes.values()] as T
    case 'save_custom_theme': {
      const theme = args?.theme as ThemeDefinition
      if (!theme.id.startsWith('custom-'))
        throw new Error('Theme id must look like custom-my-theme')
      customThemes.set(theme.id, theme)
      return theme as T
    }
    case 'delete_custom_theme':
      customThemes.delete(args?.id as string)
      return undefined as T
    case 'detect_importers':
      return [
        { id: 'steam', label: 'Steam', available: true },
        { id: 'astris', label: 'Astris', available: false },
      ] as T
    case 'toggle_favorite': {
      const gameId = args?.gameId as string
      games = games.map((g) => (g.id === gameId ? { ...g, favorite: !g.favorite } : g))
      return games.find((g) => g.id === gameId)! as T
    }
    case 'set_game_hidden': {
      const gameId = args?.gameId as string
      const hidden = args?.hidden as boolean
      games = games.map((g) => (g.id === gameId ? { ...g, hidden } : g))
      return games.find((g) => g.id === gameId)! as T
    }
    case 'delete_game': {
      const gameId = args?.gameId as string
      games = games.filter((g) => g.id !== gameId)
      return undefined as T
    }
    case 'launch_game': {
      const gameId = args?.gameId as string
      const game = games.find((g) => g.id === gameId)
      if (game?.launchConfig.type === 'wine')
        throw new Error('Windows execution requires the Orbit desktop app.')
      activeSession = {
        id: 'mock-session',
        gameId,
        provider: game?.provider ?? 'manual',
        startedAt: new Date().toISOString(),
      }
      return activeSession as T
    }
    case 'stop_game':
      activeSession = null
      return null as T
    case 'scan_switch_library_from_library':
      return {
        folders: [],
        groups: [],
        totalFiles: 0,
      } as T
    case 'get_home_content_inventory':
      return {
        summaries: [
          {
            gameId: 'mock-cyberpunk',
            versionLabel: 'Build 20383525',
            versionDetail: 'Updated Jul 21, 2026',
            dlcCount: 2,
            updateCount: 0,
            dlcNames: ['Phantom Liberty', 'Bonus content'],
            hasBase: true,
          },
        ],
      } as T
    case 'search_theme_artwork': {
      const theme = BUILT_IN_THEMES.find(
        (theme) => theme.branding?.artworkQuery === args?.query,
      )
      const image = localThemeArtwork(theme?.id ?? 'cyberpunk-2077', String(args?.slot))
      return [
        {
          id: `preview-theme-${args?.slot}`,
          title: args?.query,
          source: 'SteamGridDB',
          previewUrl: image,
          imageUrl: image,
          width: args?.slot === 'hero' ? 3840 : 800,
          height: args?.slot === 'hero' ? 2160 : 300,
        },
      ] as T
    }
    case 'fetch_theme_artwork':
      return args?.url as T
    case 'bundled_theme_artwork':
      return localThemeArtwork(String(args?.themeId), String(args?.slot)) as T
    case 'search_game_artwork': {
      const game = games.find((g) => g.id === args?.gameId) ?? games[0]!
      const sources =
        args?.source === 'steamgriddb'
          ? ['SteamGridDB']
          : args?.source === 'other'
            ? ['TheGamesDB', 'RAWG', 'Wikimedia']
            : ['SteamGridDB', 'TheGamesDB', 'RAWG', 'Wikimedia']
      return {
        hits: sources.map((source, index) => ({
          id: `preview-${index}`,
          title: game.title,
          source,
          previewUrl: game.artwork.hero ?? game.artwork.cover,
          imageUrl: game.artwork.hero ?? game.artwork.cover,
        })),
        warnings: [
          'Preview mode uses sample artwork; provider searches run in the desktop app.',
        ],
      } as T
    }
    case 'fetch_artwork_from_url':
      return args?.url as T
    case 'cache_artwork_from_url':
      return args?.url as T
    case 'set_window_fullscreen':
    case 'hide_orbit_window':
    case 'show_orbit_window':
    case 'open_xbox_cloud':
      return undefined as T
    case 'quit_orbit':
      console.info('[devMockApi] quit_orbit')
      return undefined as T
    case 'steam_windows_status':
    case 'disconnect_steam_windows': {
      if (cmd === 'disconnect_steam_windows') steamAccount = null
      return steamStatus() as T
    }
    case 'steam_windows_preferences':
      return steamPreferences as T
    case 'set_steam_windows_preferences':
      steamPreferences = {
        additionalLibraryPaths:
          (args?.preferences as SteamWindowsPreferences | undefined)
            ?.additionalLibraryPaths ?? [],
        offlineMode: Boolean(
          (args?.preferences as { offlineMode?: boolean } | undefined)?.offlineMode,
        ),
        verifyFiles:
          (args?.preferences as { verifyFiles?: boolean } | undefined)?.verifyFiles !==
          false,
        steamInput:
          (args?.preferences as SteamWindowsPreferences | undefined)?.steamInput === true,
        steamOverlay:
          (args?.preferences as SteamWindowsPreferences | undefined)?.steamOverlay ===
          true,
      }
      return steamPreferences as T
    case 'open_steam_windows_login':
      steamLoginPolls = 0
      return undefined as T
    case 'place_steam_windows_login':
      return { placed: true } as T
    case 'poll_steam_windows_login':
      steamLoginPolls += 1
      if (steamLoginPolls < 3) {
        return { done: false, status: null, libraryError: null } as T
      }
      steamAccount = 'orbit_player'
      return { done: true, status: steamStatus(), libraryError: null } as T
    case 'begin_steam_windows_password':
      steamAccount = 'orbit_player'
      return {
        clientId: '1',
        requestId: 'dev-password',
        intervalSeconds: 2,
        steamId: '76561198000000000',
        needsCode: false,
        codeType: 3,
      } as T
    case 'submit_steam_windows_guard':
      return undefined as T
    case 'start_steam_windows_qr':
      steamQrPolls = 0
      return {
        qrSvg:
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#fff"/><path fill="#000" d="M20 20h80v80H20zm120 0h80v80h-80zM20 140h80v80H20zm40 40h20v20H60zm80-40h20v20h-20zm40 0h20v20h-20zm-40 40h80v20h-80zm0 40h20v20h-20zm40 0h20v20h-20z"/></svg>',
        clientId: '1',
        requestId: 'dev-request',
        intervalSeconds: 2,
      } as T
    case 'poll_steam_windows_qr':
      steamQrPolls += 1
      if (steamQrPolls < 2) {
        return { done: false, status: null, libraryError: null } as T
      }
      steamAccount = 'orbit_player'
      return { done: true, status: steamStatus(), libraryError: null } as T
    case 'connect_steam_windows':
      steamAccount = 'orbit_player'
      return steamStatus() as T
    case 'steam_windows_library':
    case 'refresh_steam_windows_library':
    case 'retry_steam_catalog_metadata':
      return (
        steamAccount
          ? [
              {
                appId: '570',
                title: 'Dota 2',
                description: 'A multiplayer battle arena.',
                coverUrl:
                  'https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900_2x.jpg',
                heroUrl:
                  'https://cdn.akamai.steamstatic.com/steam/apps/570/library_hero.jpg',
                installed: false,
              },
              {
                appId: '730',
                title: 'Counter-Strike 2',
                description: null,
                coverUrl:
                  'https://cdn.akamai.steamstatic.com/steam/apps/730/library_600x900_2x.jpg',
                heroUrl:
                  'https://cdn.akamai.steamstatic.com/steam/apps/730/library_hero.jpg',
                installed: true,
              },
            ]
          : []
      ) as T
    case 'install_windows_steam':
      return undefined as T
    case 'cancel_steam_windows_sign_in':
    case 'cancel_steam_windows_download':
    case 'download_steam_windows_game':
    case 'enqueue_steam_download':
    case 'remove_queued_download':
    case 'start_queued_download_now':
    case 'pause_active_download':
    case 'remove_component':
      return undefined as T
    case 'remove_storage_item':
      return 0 as T
    case 'get_download_queue':
      return { active: null, pending: [], waitingForNetwork: false } as T
    case 'steam_controller_support':
      return 'full' as T
    case 'list_install_locations':
      return [...mockInstallLocations] as T
    case 'add_install_location': {
      const raw = String(args?.path ?? '')
        .trim()
        .replace(/\\([ \\()'"&;])/g, '$1')
        .replace(/\/+$/, '')
      if (!raw.startsWith('/')) {
        throw new Error('Choose a folder by its full path')
      }
      const existing = mockInstallLocations.find((item) => item.id === raw)
      if (existing) return existing as T
      const parts = raw.split('/').filter(Boolean)
      const label =
        parts[0] === 'Volumes' && parts.length > 2
          ? `${parts[1]} · ${parts[parts.length - 1]}`
          : (parts[parts.length - 1] ?? raw)
      const added: InstallLocation = {
        id: raw,
        label,
        path: raw,
        available: true,
        freeBytes: 900_000_000_000,
        totalBytes: 1_000_000_000_000,
        isDefault: false,
        gameCount: 0,
      }
      mockInstallLocations = [...mockInstallLocations, added]
      return added as T
    }
    case 'remove_install_location': {
      const id = String(args?.id ?? '')
      mockInstallLocations = mockInstallLocations.filter((item) => item.id !== id)
      return undefined as T
    }
    case 'get_network_stats':
      return { online: true, downloadRate: 0, uploadRate: 0 } as T
    case 'uninstall_steam_game':
      return { removedBytes: 0, keptPrefix: false } as T
    case 'repair_steam_game':
      return 'queued' as T
    case 'get_game_compression':
    case 'set_game_compression':
      return {
        enabled: args?.enabled === true,
        running: false,
        compressing: args?.enabled === true,
        gamesDone: 0,
        gamesTotal: 0,
        currentTitle: null,
        bytesDone: 0,
        bytesTotal: 0,
        savedBytes: 0,
        skippedGames: 0,
        error: null,
      } as T
    case 'get_storage_overview':
      return mockStorageOverview() as T
    case 'get_install_sizes': {
      const catalog = await mockInvoke<SteamOwnedGame[]>('steam_windows_library')
      const entry = mockLibrary(games, catalog).find((item) => item.id === args?.entryId)
      return (entry?.installations ?? [])
        .filter((item) => item.available)
        .map((item) => ({
          installationId: item.id,
          root: item.path ?? `/Games/${entry?.game.title ?? 'Game'}`,
          sizeBytes: 64_424_509_440,
          truncated: false,
        })) as T
    }
    case 'play_steam_windows_game':
      throw new Error('Playing a Windows Steam game requires the Orbit desktop app.')
    default:
      console.warn(`[devMockApi] Unhandled command: ${cmd}`)
      return null as T
  }
}
