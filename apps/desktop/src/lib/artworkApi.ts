import { isTauriRuntime, mockInvoke } from '@/lib/devMockApi'
import type { ArtworkSlot } from '@/lib/artwork'
import { invoke } from '@tauri-apps/api/core'
import type { GameArtwork } from '@/types/game'
import { isBase64Artwork } from '@/lib/artwork'
import { cacheArtworkFromUrl } from '@/lib/tauri'

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return isTauriRuntime() ? invoke<T>(command, args) : mockInvoke<T>(command, args)
}

export interface ArtworkSearchHit {
  id: string
  title: string
  previewUrl: string
  imageUrl: string
  source: string
}

export async function readArtworkFromPath(path: string): Promise<string> {
  return call<string>('read_artwork_from_path', { path })
}

export async function fetchArtworkFromUrl(url: string): Promise<string> {
  return call<string>('fetch_artwork_from_url', { url })
}

export async function searchPublicArtwork(
  query: string,
  limit = 12,
): Promise<ArtworkSearchHit[]> {
  return call<ArtworkSearchHit[]>('search_public_artwork', { query, limit })
}

/** Normalize a path, URL, or existing data URL to a webview-loadable reference.
 *  Remote URLs are downloaded and cached locally so artwork renders offline. */
export async function normalizeArtworkValue(
  gameId: string,
  slot: string,
  value?: string | null,
): Promise<string | undefined> {
  if (!value?.trim()) return undefined
  if (isBase64Artwork(value)) return value
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return cacheArtworkFromUrl(value, gameId, slot)
  }
  return readArtworkFromPath(value)
}

export async function normalizeArtwork(
  gameId: string,
  artwork: Partial<GameArtwork>,
): Promise<GameArtwork> {
  const [cover, hero, icon, logo] = await Promise.all([
    normalizeArtworkValue(gameId, 'cover', artwork.cover),
    normalizeArtworkValue(gameId, 'hero', artwork.hero),
    normalizeArtworkValue(gameId, 'icon', artwork.icon),
    normalizeArtworkValue(gameId, 'logo', artwork.logo),
  ])
  return {
    cover,
    hero,
    icon,
    logo,
  }
}

export interface ArtworkSearchResults {
  hits: ArtworkSearchHit[]
  warnings: string[]
}
export async function searchGameArtwork(
  query: string,
  slot: ArtworkSlot,
  gameId?: string,
  source: 'all' | 'steamgriddb' | 'other' = 'all',
): Promise<ArtworkSearchResults> {
  return call('search_game_artwork', { query, slot, gameId, source })
}
