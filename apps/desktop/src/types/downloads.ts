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
