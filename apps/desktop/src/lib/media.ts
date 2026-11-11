import { localThemeArtwork, localThemePreview } from '@/lib/bundledArtwork'
import { convertFileSrc } from '@tauri-apps/api/core'

/** Convert a local filesystem path to a webview-loadable URL when needed. */
export function mediaSrc(path?: string | null): string | undefined {
  if (!path) return undefined
  if (path.startsWith('orbit-bundled:')) {
    const match = /^orbit-bundled:([a-z0-9-]+):(logo|hero)$/.exec(path)
    return match ? (localThemeArtwork(match[1], match[2]) ?? undefined) : undefined
  }
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('asset:') ||
    path.startsWith('tauri://localhost/') ||
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

/** Custom copies keep opaque bundled references; grids resolve only their small previews. */
export function themePreviewSrc(path?: string | null): string | undefined {
  if (path?.startsWith('orbit-bundled:')) {
    const match = /^orbit-bundled:([a-z0-9-]+):(logo|hero)$/.exec(path)
    return match
      ? (localThemePreview(match[1], match[2] as 'logo' | 'hero') ?? undefined)
      : undefined
  }
  return mediaSrc(path)
}

/** Quote a CSS `url(...)` value so asset/data paths with special characters stay valid. */
export function cssUrl(image: string): string {
  const safe = image.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `url("${safe}")`
}

/** Build a CSS `url(...)` value, converting local paths to asset URLs first. */
export function cssUrlMedia(image: string): string {
  return cssUrl(mediaSrc(image) ?? image)
}
