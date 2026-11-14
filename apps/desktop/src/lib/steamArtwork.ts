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
