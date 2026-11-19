import type { GameArtwork } from '@/types/game'
import { gameTileImage } from '@/lib/artwork'
import { steamLibraryArt } from '@/lib/steamArtwork'

/** What `ProgressiveArtwork` paints: a cheap preview, then the full image. */
export interface ArtworkSources {
  /** Small image shown blurred while the full one decodes. */
  low?: string
  high?: string
  /** Sharper copy for Retina displays. */
  high2x?: string
}

/** Stored artwork wins; Steam library art fills in for Steam games without
 * any. The Steam capsule is the preview either way, since it is tiny.
 */
export function artworkSources(
  artwork: GameArtwork,
  steamAppId: string | null | undefined,
  variant: 'portrait' | 'square' = 'square',
): ArtworkSources {
  const stored = gameTileImage(artwork, variant)
  const steam = steamLibraryArt(steamAppId)
  if (!stored) return steam ?? {}
  return {
    high: stored,
    ...(steam && stored === steam.high && { high2x: steam.high2x }),
    ...(steam && { low: steam.low }),
  }
}
