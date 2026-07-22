import type { GameArtwork } from '@/types/game'
import { mediaSrc } from '@/lib/media'
import { placeholderGradient } from '@/lib/format'

export type ArtworkSlot = 'cover' | 'hero' | 'icon'

/** Wide hero art for backgrounds — prefers landscape hero, then cover. */
export function gameHeroImage(artwork: GameArtwork): string | undefined {
  return mediaSrc(artwork.hero ?? artwork.cover)
}

/** Best image for a game tile — prefers square icon when set. */
export function gameTileImage(
  artwork: GameArtwork,
  variant: 'portrait' | 'square' = 'portrait',
): string | undefined {
  if (variant === 'square') {
    return mediaSrc(artwork.icon ?? artwork.cover ?? artwork.hero)
  }
  return mediaSrc(artwork.cover ?? artwork.icon ?? artwork.hero)
}

export function artworkPreview(
  artwork: GameArtwork,
  slot: ArtworkSlot,
): string | undefined {
  const value =
    slot === 'cover'
      ? artwork.cover
      : slot === 'hero'
        ? artwork.hero
        : artwork.icon
  return mediaSrc(value)
}

export function artworkPlaceholder(gameId: string): string {
  return placeholderGradient(gameId)
}

export function isBase64Artwork(value?: string | null): boolean {
  return Boolean(value?.startsWith('data:image/'))
}
