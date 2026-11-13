import { localThemeArtwork } from './bundledArtwork'
import type { Game, GameSession } from '@/types/game'
import type { ThemeDefinition } from '@/themes/types'
import { BUILT_IN_THEMES, DEFAULT_THEME_ID } from '@/themes/catalog'

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
  switch (cmd) {
    case 'get_gamehub_library':
      return {
        available: true,
        running: true,
        capturedAt: new Date().toISOString(),
        directInstallSupported: false,
        warnings: [],
        games: [
          {
            id: 'steam:400',
            store: 'steam',
            title: 'Portal',
            installed: false,
            phase: null,
            percent: null,
          },
          {
            id: 'steam:620',
            store: 'steam',
            title: 'Portal 2',
            installed: true,
            phase: 'completed',
            percent: 100,
          },
          {
            id: 'gog:sample',
            store: 'gog',
            title: 'Sample GOG game',
            installed: false,
            phase: 'downloading',
            percent: 42,
          },
          {
            id: 'epic:sample',
            store: 'epic',
            title: 'Sample Epic game',
            installed: false,
            phase: 'paused',
            percent: 18,
          },
        ],
      } as T
    case 'scan_steam_library':
      return { imported: 0, enriched: 0, provider: 'steam' } as T
    case 'scan_gamehub_folder':
      return { imported: 0, enriched: 0, provider: 'gamehub' } as T
    case 'install_steam_game':
    case 'open_steam_library':
    case 'open_gamehub':
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
    case 'compatibility_settings':
      return (settings.get('windows-compatibility-settings-v1') ?? {
        graphics: 'auto',
        synchronization: 'default',
        retinaMode: false,
        metalHud: false,
        avx: false,
        upscaling: false,
        upscaleRatio: 0,
        frameGeneration: false,
        frameGenerationVsync: false,
        frameRateLimit: null,
        dxmtNvidiaExtensions: false,
        resolution: 'auto',
        resolutionWidth: 1920,
        resolutionHeight: 1080,
      }) as T
    case 'update_compatibility_settings': {
      settings.set('windows-compatibility-settings-v1', args?.settings)
      return args?.settings as T
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
      return undefined as T
    case 'quit_orbit':
      console.info('[devMockApi] quit_orbit')
      return undefined as T
    default:
      console.warn(`[devMockApi] Unhandled command: ${cmd}`)
      return null as T
  }
}
