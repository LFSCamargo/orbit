import type { GameProvider } from './game'

export interface XboxDeviceStart {
  userCode: string
  verificationUri: string
  intervalSeconds: number
  expiresInSeconds: number
}

export interface XcloudIceCandidate {
  candidate: string
  sdpMid: string | null
  sdpMLineIndex: number | null
}

export interface XcloudStreamState {
  /** Microsoft's state: Provisioning, WaitingForResources, ReadyToConnect, Provisioned, Failed. */
  state: string
  error: string | null
}

export interface XcloudStreamStatus {
  market: string
  /** Region Microsoft picks by default. */
  region: string
  regions: string[]
}

export interface XboxAccount {
  gamertag: string
  xuid: string
}

export interface XboxDevicePoll {
  done: boolean
  account: XboxAccount | null
}

export interface XcloudCatalogItem {
  productId: string
  title: string
  xboxTitleId: string | null
  coverUrl: string | null
  heroUrl: string | null
  logoUrl: string | null
  launchUrl: string
  /** Set once the title has been played through Orbit. */
  libraryGameId: string | null
  /** Other providers that already have this title. */
  alsoOn: GameProvider[]
}

export interface XcloudCatalog {
  market: string
  fetchedAt: string | null
  stale: boolean
  error: string | null
  items: XcloudCatalogItem[]
}
