/** Where Orbit's own update stands (`services/app_update.rs`). */
export type AppUpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'upToDate'; checkedAt: string }
  | { status: 'downloading'; version: string; downloaded: number; total: number | null }
  | { status: 'ready'; version: string; notes: string | null }
  | { status: 'unsupported'; reason: string; releasesUrl: string }
  | { status: 'failed'; message: string }
