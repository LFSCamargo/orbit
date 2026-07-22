const CACHE_LIMIT = 16
const blurCache = new Map<string, string>()

function shouldUseCrossOrigin(url: string): boolean {
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('asset:')
  ) {
    return false
  }

  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.hostname === 'asset.localhost' || parsed.hostname === 'ipc.localhost') {
      return false
    }
    return parsed.origin !== window.location.origin
  } catch {
    return false
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (shouldUseCrossOrigin(url)) {
      img.crossOrigin = 'anonymous'
    }
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load hero image: ${url}`))
    img.src = url
  })
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
) {
  const imageRatio = img.naturalWidth / img.naturalHeight
  const canvasRatio = width / height
  let sourceWidth: number
  let sourceHeight: number
  let sourceX: number
  let sourceY: number

  if (imageRatio > canvasRatio) {
    sourceHeight = img.naturalHeight
    sourceWidth = sourceHeight * canvasRatio
    sourceX = (img.naturalWidth - sourceWidth) / 2
    sourceY = 0
  } else {
    sourceWidth = img.naturalWidth
    sourceHeight = sourceWidth / canvasRatio
    sourceX = 0
    sourceY = (img.naturalHeight - sourceHeight) / 2
  }

  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
}

/** Pre-render a downscaled, blurred hero bitmap (cached). Optional perf upgrade over CSS filter. */
export async function renderBlurredHero(
  imageUrl: string,
  blurRadius = 32,
): Promise<string | null> {
  const cacheKey = `${imageUrl}|${blurRadius}`
  const cached = blurCache.get(cacheKey)
  if (cached) return cached

  try {
    const img = await loadImage(imageUrl)
    const width = 640
    const height = 360
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    ctx.filter = `blur(${blurRadius}px) saturate(140%)`
    drawCover(ctx, img, width, height)
    ctx.filter = 'none'

    const dataUrl = canvas.toDataURL('image/jpeg', 0.84)

    if (blurCache.size >= CACHE_LIMIT) {
      const oldest = blurCache.keys().next().value
      if (oldest) blurCache.delete(oldest)
    }
    blurCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

export function clearHeroBlurCache() {
  blurCache.clear()
}
