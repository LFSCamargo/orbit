// Retain decoded thumbnail objects across loop copies and route changes. Bounded
// LRU storage avoids retaining artwork for every game in a large library.
const cache = new Map<
  string,
  { image: HTMLImageElement; ready: Promise<boolean>; decoded: boolean }
>()
export function preloadCarouselArtwork(url: string): Promise<boolean> {
  const existing = cache.get(url)
  if (existing) {
    cache.delete(url)
    cache.set(url, existing)
    return existing.ready
  }
  const image = new Image()
  image.src = url
  const ready = image.decode().then(
    () => {
      const entry = cache.get(url)
      if (entry) entry.decoded = true
      return true
    },
    () => false,
  )
  cache.set(url, { image, ready, decoded: false })
  if (cache.size > 64) cache.delete(cache.keys().next().value!)
  return ready
}

export function cachedCarouselArtwork(url?: string) {
  return url && cache.get(url)?.decoded ? url : undefined
}
