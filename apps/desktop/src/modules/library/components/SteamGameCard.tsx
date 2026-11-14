import { useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { placeholderGradient } from '@/lib/format'
import { steamCoverCandidates } from '@/lib/steamArtwork'
import type { SteamOwnedGame } from '@/types/steam'

export function SteamGameCard({
  game,
  order,
  onOpen,
}: {
  game: SteamOwnedGame
  order: number
  onOpen: (game: SteamOwnedGame) => void
}) {
  const candidates = steamCoverCandidates(game.appId, game.coverUrl)
  const [index, setIndex] = useState(0)
  const image = candidates[index]
  return (
    <Focusable
      focusId={`library-steam-game-${game.appId}`}
      group="library-steam"
      order={order}
      noRing
      aria-label={game.title}
      onClick={() => onOpen(game)}
      className="orbit-library-card orbit-transition w-full shrink-0 rounded-card text-left"
    >
      <div className="relative overflow-hidden rounded-card bg-orbit-panel">
        <SquareGameArt
          image={image}
          placeholder={placeholderGradient(game.appId)}
          fit="cover"
          roundedClassName="rounded-none"
          className="aspect-square w-full"
        />
        {image && (
          <img
            src={image}
            alt=""
            className="hidden"
            onError={() => setIndex((current) => current + 1)}
          />
        )}
        <div className="min-h-[4.6rem] px-3 py-2.5">
          <p className="line-clamp-2 font-medium leading-snug text-orbit-foreground">
            {game.title}
          </p>
          <p className="mt-1 truncate text-xs uppercase tracking-wider text-orbit-muted">
            {game.installed ? 'Steam · Installed' : 'Steam · Not installed'}
          </p>
        </div>
      </div>
    </Focusable>
  )
}
