const CDN = 'https://cdn.akamai.steamstatic.com/steam/apps'

export function steamCoverCandidates(appId: string, preferred?: string | null): string[] {
  if (!/^[1-9]\d{0,9}$/.test(appId)) return []
  const urls = [
    preferred?.trim() || '',
    `${CDN}/${appId}/library_600x900_2x.jpg`,
    `${CDN}/${appId}/library_600x900.jpg`,
    `${CDN}/${appId}/logo.png`,
    `${CDN}/${appId}/header.jpg`,
  ]
  return [...new Set(urls.filter((url) => url.startsWith('https://')))]
}

export function steamHeroCandidates(appId: string, preferred?: string | null): string[] {
  if (!/^[1-9]\d{0,9}$/.test(appId)) return []
  const urls = [
    preferred?.trim() || '',
    `${CDN}/${appId}/library_hero.jpg`,
    `${CDN}/${appId}/header.jpg`,
  ]
  return [...new Set(urls.filter((url) => url.startsWith('https://')))]
}

/** Steam's transparent horizontal wordmark (`logo.png`). */
export function steamLogoUrl(appId?: string | null): string | undefined {
  if (!appId || !/^[1-9]\d{0,9}$/.test(appId)) return undefined
  return `${CDN}/${appId}/logo.png`
}

/** Steam library art at 1x and 2x, plus the tiny store capsule as a quick preview. */
export function steamLibraryArt(
  appId?: string | null,
): { high: string; high2x: string; low: string } | undefined {
  if (!appId || !/^[1-9]\d{0,9}$/.test(appId)) return undefined
  return {
    high: `${CDN}/${appId}/library_600x900.jpg`,
    high2x: `${CDN}/${appId}/library_600x900_2x.jpg`,
    low: `${CDN}/${appId}/capsule_231x87.jpg`,
  }
}
