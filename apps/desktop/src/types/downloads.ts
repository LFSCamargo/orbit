export interface QueuedDownload {
  appId: string
  title: string
  coverUrl: string | null
  paused: boolean
}

/** The native download queue: one active SteamCMD transfer, the rest in order. */
export interface DownloadQueue {
  active: QueuedDownload | null
  pending: QueuedDownload[]
  /** The Mac is offline; waiting titles resume on their own once it is back. */
  waitingForNetwork?: boolean
}

/** A place a Steam game can be installed: This Mac or a folder the person added. */
export interface InstallLocation {
  /** `this-mac`, or the folder's path. */
  id: string
  label: string
  path: string | null
  /** The folder's drive is connected and writable. */
  available: boolean
  freeBytes: number | null
  totalBytes: number | null
  /** Used for the last download. */
  isDefault: boolean
  /** Games installed or downloading there; such a location cannot be removed. */
  gameCount: number
}

/** One sample of the Mac's network links, emitted every second as `network-stats`. */
export interface NetworkStats {
  online: boolean
  /** Bytes per second received. */
  downloadRate: number
  /** Bytes per second sent. */
  uploadRate: number
}

export interface UninstallReport {
  removedBytes: number
  /** Saves were asked to go but the game's prefix holds a Steam sign-in. */
  keptPrefix: boolean
}
