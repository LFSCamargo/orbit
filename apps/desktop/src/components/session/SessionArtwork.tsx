import { clsx } from 'clsx'
import type { Game } from '@/types/game'
import { gameHeroImage, gameTileImage, artworkPlaceholder } from '@/lib/artwork'
import { cssUrl } from '@/lib/media'

/** A consistent cinematic backdrop for the active session and its quick menu. */
export function SessionArtwork({
  game,
  className,
}: {
  game?: Game | null
  className?: string
}) {
  const image =
    game && (gameHeroImage(game.artwork) || gameTileImage(game.artwork, 'square'))
  return (
    <div
      className={clsx(
        'session-artwork absolute inset-0 -z-[2] bg-cover bg-center',
        className ?? 'opacity-[0.65]',
      )}
      aria-hidden
      style={{
        backgroundImage: image
          ? cssUrl(image)
          : artworkPlaceholder(game?.id ?? 'session'),
      }}
    />
  )
}
