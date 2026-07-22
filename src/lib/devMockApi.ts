import type { Game, GameSession } from '@/types/game'
import type { ThemeDefinition } from '@/themes/types'
import { BUILT_IN_THEMES } from '@/themes/types'

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
const settings = new Map<string, unknown>([
  ['themeId', 'orbit'],
  ['rawgApiKey', ''],
])

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'list_games':
      return games.filter((g) => !g.hidden) as T
    case 'get_game': {
      const gameId = args?.gameId as string
      return (games.find((g) => g.id === gameId) ?? null) as T
    }
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
    case 'list_custom_themes':
      return [] as T
    case 'detect_importers':
      return [
        { id: 'steam', label: 'Steam', available: true },
        { id: 'astris', label: 'Astris', available: false },
      ] as T
    case 'toggle_favorite': {
      const gameId = args?.gameId as string
      games = games.map((g) =>
        g.id === gameId ? { ...g, favorite: !g.favorite } : g,
      )
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
    case 'set_window_fullscreen':
    case 'hide_orbit_window':
    case 'show_orbit_window':
      return undefined as T
    default:
      console.warn(`[devMockApi] Unhandled command: ${cmd}`)
      return null as T
  }
}

export function getBuiltInThemes(): ThemeDefinition[] {
  return BUILT_IN_THEMES
}
