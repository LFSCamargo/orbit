export type GameProvider = 'astris' | 'steam' | 'gamehub' | 'native' | 'manual'

export type GamePlatform =
  | 'nintendo-switch'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'unknown'

export type LaunchConfiguration =
  | {
      type: 'open-file'
      filePath: string
      applicationPath?: string
    }
  | {
      type: 'open-application'
      applicationPath: string
      arguments?: string[]
    }
  | {
      type: 'open-url'
      url: string
    }
  | {
      type: 'steam'
      appId: string
    }
  | {
      type: 'custom-command'
      executable: string
      arguments: string[]
    }
  | {
      type: 'gamehub'
      gamehubAppPath: string
      shortcutAppPath: string
    }

export interface GameArtwork {
  cover?: string
  hero?: string
  logo?: string
  icon?: string
}

export interface Achievement {
  id: string
  name: string
  description?: string
  unlocked: boolean
  unlockedAt?: string
  icon?: string
}

export interface Game {
  id: string
  title: string
  sortTitle: string
  description?: string
  provider: GameProvider
  platform: GamePlatform
  sourceId?: string
  launchConfig: LaunchConfiguration
  artwork: GameArtwork
  favorite: boolean
  hidden: boolean
  dateAdded: string
  lastPlayedAt?: string
  totalPlaytimeSeconds: number
  installSizeBytes?: number
  achievements: Achievement[]
}

export interface CreateGameRequest {
  title: string
  description?: string
  provider: GameProvider
  platform: GamePlatform
  launchConfig: LaunchConfiguration
  artwork?: GameArtwork
  installSizeBytes?: number
}

export interface UpdateGameRequest {
  title?: string
  description?: string
  artwork?: GameArtwork
  launchConfig?: LaunchConfiguration
  installSizeBytes?: number
}

export interface ScanResult {
  imported: number
  provider: string
}

export interface ImporterStatus {
  id: string
  detected: boolean
  label: string
  experimental: boolean
}

export type SessionStopReason =
  | 'process-exited'
  | 'user-stopped'
  | 'launch-failed'
  | 'unknown'

export interface GameSession {
  id: string
  gameId: string
  provider: GameProvider
  pid?: number
  startedAt: string
  endedAt?: string
  exitCode?: number
  stopReason?: SessionStopReason
  durationSeconds?: number
}

export type LibrarySort =
  | 'recently-played'
  | 'recently-added'
  | 'alphabetical'
  | 'playtime'
  | 'provider'

export interface LibraryFilters {
  query: string
  providers: GameProvider[]
  platforms: GamePlatform[]
  favoritesOnly: boolean
  showHidden: boolean
  sort: LibrarySort
}

export type AppScreen =
  | 'home'
  | 'library'
  | 'search'
  | 'game-details'
  | 'game-edit'
  | 'add-game'
  | 'settings'
  | 'switch-library'
