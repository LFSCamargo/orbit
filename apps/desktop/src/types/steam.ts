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

export interface SteamWindowsPreferences {
  offlineMode: boolean
  verifyFiles: boolean
  additionalLibraryPaths?: string[]
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
