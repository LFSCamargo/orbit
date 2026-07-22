import { convertFileSrc } from '@tauri-apps/api/core'

/** Convert a local filesystem path to a webview-loadable URL when needed. */
export function mediaSrc(path?: string | null): string | undefined {
  if (!path) return undefined
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('asset:') ||
    path.startsWith('blob:')
  ) {
    return path
  }
  try {
    return convertFileSrc(path)
  } catch {
    return path
  }
}
