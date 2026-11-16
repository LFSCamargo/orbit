import type { GameArtwork } from '@/types/game'
import { mediaSrc } from '@/lib/media'
import { placeholderGradient } from '@/lib/format'
import { steamLogoUrl } from '@/lib/steamArtwork'

export type ArtworkSlot = 'cover' | 'hero' | 'icon' | 'logo'

/** Wide hero art for backgrounds — prefers landscape hero, then cover. */
export function gameHeroImage(artwork: GameArtwork): string | undefined {
  return mediaSrc(artwork.hero ?? artwork.cover)
}

/** Best image for a game tile — square tiles prefer 1:1 icon/grid art. */
export function gameTileImage(
  artwork: GameArtwork,
  variant: 'portrait' | 'square' = 'portrait',
): string | undefined {
  if (variant === 'square') {
    return mediaSrc(artwork.icon ?? artwork.cover ?? artwork.hero)
  }
  return mediaSrc(artwork.cover ?? artwork.icon ?? artwork.hero)
}

/** Homepage shelf: 1:1 grids only — never portrait cover or landscape hero. */
export function gameSquareTileImage(artwork: GameArtwork): string | undefined {
  return mediaSrc(artwork.icon)
}

/** Contain true square icons; cover-fit portrait fallbacks. */
export function gameTileFit(
  artwork: GameArtwork,
  variant: 'portrait' | 'square' = 'portrait',
): 'cover' | 'contain' {
  if (variant === 'square' && artwork.icon) return 'contain'
  return 'cover'
}

export function artworkPreview(
  artwork: GameArtwork,
  slot: ArtworkSlot,
): string | undefined {
  return mediaSrc(artwork[slot])
}

/** Transparent wordmark: stored logo, then Steam's horizontal `logo.png`. */
export function gameLogoImage(
  artwork: GameArtwork,
  steamAppId?: string | null,
): string | undefined {
  return mediaSrc(artwork.logo) ?? steamLogoUrl(steamAppId)
}

export function artworkPlaceholder(gameId: string): string {
  return placeholderGradient(gameId)
}

export function isBase64Artwork(value?: string | null): boolean {
  return Boolean(value?.startsWith('data:image/'))
}
