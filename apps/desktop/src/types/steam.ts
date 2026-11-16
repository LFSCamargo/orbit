export type SteamClientPhase = 'stopped' | 'starting' | 'connecting' | 'ready' | 'failed'

export interface SteamWindowsStatus {
  signedIn: boolean
  accountName: string | null
  steamInstalled: boolean
  clientRunning: boolean
  clientLoggedIn: boolean
  clientPhase: SteamClientPhase
  clientCaption: string
  ownedCount: number
}

export type SteamPlayEngine = 'auto' | 'orbit' | 'gamehub'

export interface SteamWindowsPreferences {
  offlineMode: boolean
  verifyFiles: boolean
  additionalLibraryPaths?: string[]
  /**
   * Which engine plays Steam Windows titles. `auto` uses a local GameHub
   * container when GameHub manages the game, otherwise Orbit's own silent
   * Steam client. `gamehub` requires the container and fails loudly when it
   * is unavailable.
   */
  playEngine?: SteamPlayEngine
}

export interface SteamOwnedGame {
  appId: string
  title: string
  description: string | null
  coverUrl: string
  heroUrl: string
  installed: boolean
  minimumRequirements?: string | null
  recommendedRequirements?: string | null
  protonTier?: string | null
}

export interface SteamQrStart {
  qrSvg: string
  clientId: string
  requestId: string
  intervalSeconds: number
}

export interface SteamQrPoll {
  done: boolean
  status: SteamWindowsStatus | null
  libraryError: string | null
}

export interface SteamPasswordStart {
  clientId: string
  requestId: string
  intervalSeconds: number
  steamId: string | null
  needsCode: boolean
  codeType: number
}

export interface SteamLoginPoll {
  done: boolean
  status: SteamWindowsStatus | null
  libraryError: string | null
}

export interface SteamLoginPlacement {
  placed: boolean
}
