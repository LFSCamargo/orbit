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

const SLOT_NAMES: Record<keyof GameArtwork, string> = {
  cover: 'portrait cover',
  hero: 'landscape hero',
  icon: 'square icon',
  logo: 'logo',
}

/** Artwork ready to save. Only slots that differ from `saved` are downloaded:
 *  an untouched remote logo that no longer exists (Steam has none for some
 *  apps) must not block saving the others. */
export async function normalizeArtwork(
  gameId: string,
  artwork: Partial<GameArtwork>,
  saved: Partial<GameArtwork> = {},
): Promise<GameArtwork> {
  const slot = async (key: keyof GameArtwork) => {
    const value = artwork[key]
    if (value && value === saved[key]) return value
    try {
      return await normalizeArtworkValue(gameId, key, value)
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error))
        .replace(/^Failed to download\s*/i, '')
        .replace(/^\((.*)\)$/, '$1')
      throw new Error(`The ${SLOT_NAMES[key]} image couldn’t be downloaded (${reason}).`)
    }
  }
  const [cover, hero, icon, logo] = await Promise.all([
    slot('cover'),
    slot('hero'),
    slot('icon'),
    slot('logo'),
  ])
  return { cover, hero, icon, logo }
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
