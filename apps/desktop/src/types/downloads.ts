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
}

export interface UninstallReport {
  removedBytes: number
  /** Saves were asked to go but the game's prefix holds a Steam sign-in. */
  keptPrefix: boolean
}
