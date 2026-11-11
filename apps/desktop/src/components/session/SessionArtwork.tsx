import type { Game } from '@/types/game'
import { gameHeroImage, gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { cssUrl } from '@/lib/media'

/** A consistent cinematic backdrop for the active session and its quick menu. */
export function SessionArtwork({ game }: { game?: Game | null }) {
  const image =
    game && (gameHeroImage(game.artwork) || gameTileImage(game.artwork, 'square'))
  return (
    <div
      className="session-artwork"
      aria-hidden
      style={{
        backgroundImage: image
          ? cssUrl(image)
          : artworkPlaceholder(game?.id ?? 'session'),
      }}
    />
  )
}
