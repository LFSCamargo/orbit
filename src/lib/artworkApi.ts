import { invoke } from '@tauri-apps/api/core'
import type { GameArtwork } from '@/types/game'
import { isBase64Artwork } from '@/lib/artwork'

export interface ArtworkSearchHit {
  id: string
  title: string
  previewUrl: string
  imageUrl: string
  source: string
}

export async function readArtworkFromPath(path: string): Promise<string> {
  return invoke<string>('read_artwork_from_path', { path })
}

export async function fetchArtworkFromUrl(url: string): Promise<string> {
  return invoke<string>('fetch_artwork_from_url', { url })
}

export async function searchPublicArtwork(
  query: string,
  limit = 12,
): Promise<ArtworkSearchHit[]> {
  return invoke<ArtworkSearchHit[]>('search_public_artwork', { query, limit })
}

/** Normalize a path, URL, or existing data URL to a Base64 data URL for DB storage. */
export async function normalizeArtworkValue(
  value?: string | null,
): Promise<string | undefined> {
  if (!value?.trim()) return undefined
  if (isBase64Artwork(value)) return value
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return fetchArtworkFromUrl(value)
  }
  return readArtworkFromPath(value)
}

export async function normalizeArtwork(
  artwork: Partial<GameArtwork>,
): Promise<GameArtwork> {
  const [cover, hero, icon, logo] = await Promise.all([
    normalizeArtworkValue(artwork.cover),
    normalizeArtworkValue(artwork.hero),
    normalizeArtworkValue(artwork.icon),
    normalizeArtworkValue(artwork.logo),
  ])
  return {
    cover,
    hero,
    icon,
    logo,
  }
}
