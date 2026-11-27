/** Settings → Storage game compression, and the job applying it. */
export interface CompressionStatus {
  enabled: boolean
  running: boolean
  /** True while compressing, false while decompressing. */
  compressing: boolean
  gamesDone: number
  gamesTotal: number
  currentTitle: string | null
  bytesDone: number
  bytesTotal: number
  /** Disk space saved; negative while decompressing gives it back. */
  savedBytes: number
  skippedGames: number
  error: string | null
}
