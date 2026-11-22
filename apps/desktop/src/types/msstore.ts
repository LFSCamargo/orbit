import type { GameProvider } from './game'

export interface MsStoreAccountStatus {
  signedIn: boolean
  deviceReady: boolean
  accountLabel: string | null
  gamertag: string | null
  xuid: string | null
  wineReady: boolean
  xgameruntimeInstalled: boolean
}

interface MsStoreCatalogEntry {
  productId: string
  title: string
  description: string | null
  contentId: string | null
  packageFamilyName: string | null
  xboxTitleId: string | null
  installSizeBytes: number | null
  coverUrl: string | null
  squareUrl: string | null
  heroUrl: string | null
  logoUrl: string | null
  owned: boolean
  gamePassPc: boolean
}

export interface MsStoreCatalogItem extends MsStoreCatalogEntry {
  libraryGameId: string | null
  alsoOn: GameProvider[]
}

export interface MsStoreCatalog {
  market: string
  fetchedAt: string | null
  stale: boolean
  error: string | null
  items: MsStoreCatalogItem[]
}
