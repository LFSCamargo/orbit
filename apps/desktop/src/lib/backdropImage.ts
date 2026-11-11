import { getHeroLighting, isTauriRuntime } from '@/lib/tauri'
import { sampleBackdropLighting, type BackdropLighting } from './backdropLighting'

export interface BackdropSource {
  url: string
  localGame?: { id: string; slot: 'hero' | 'cover' }
}

export interface ReadyBackdrop {
  url: string
  lighting: BackdropLighting | null
  cors: boolean
}

const lightingCache = new Map<string, BackdropLighting>()
const CACHE_LIMIT = 24

function loadImage(url: string, cors: boolean, signal: AbortSignal) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (signal.aborted) return resolve(null)
    const image = new Image()
    image.decoding = 'async'
    if (cors) image.crossOrigin = 'anonymous'

    const settle = (loaded: HTMLImageElement | null) => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      image.onload = image.onerror = null
      if (!loaded) image.removeAttribute('src')
      resolve(loaded)
    }
    const abort = () => settle(null)
    const timer = window.setTimeout(abort, 6000)
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => void image.decode().then(() => settle(image), abort)
    image.onerror = abort
    image.src = url
  })
}

export async function prepareBackdrop(
  source: BackdropSource,
  signal: AbortSignal,
): Promise<ReadyBackdrop | null> {
  const { url, localGame } = source
  const cached = lightingCache.get(url)
  const nativeLighting =
    !cached && localGame && isTauriRuntime()
      ? getHeroLighting(localGame.id, localGame.slot).catch(() => null)
      : null

  let cors = needsCors(url)
  let image = await loadImage(url, cors, signal)
  if (!image && cors && !signal.aborted) {
    cors = false
    image = await loadImage(url, cors, signal)
  }
  if (!image || signal.aborted) return null

  const lighting = cached ?? (await nativeLighting) ?? sampleBackdropLighting(image)
  if (lighting && !cached && url.length < 4096) {
    if (lightingCache.size >= CACHE_LIMIT) {
      const oldest = lightingCache.keys().next().value
      if (oldest) lightingCache.delete(oldest)
    }
    lightingCache.set(url, lighting)
  }
  return signal.aborted ? null : { url, lighting, cors }
}

function needsCors(url: string): boolean {
  if (!/^https?:/.test(url)) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname !== 'asset.localhost' && parsed.origin !== window.location.origin
    )
  } catch {
    return false
  }
}
