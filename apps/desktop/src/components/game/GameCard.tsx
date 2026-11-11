import { memo } from 'react'
import { clsx } from 'clsx'
import { Heart } from 'lucide-react'
import type { Game } from '@/types/game'
import { gameTileImage } from '@/lib/artwork'
import { Focusable } from '@/components/focus/Focusable'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { placeholderGradient } from '@/lib/format'
import { cssUrl } from '@/lib/media'

interface GameCardProps {
  game: Game
  focusId: string
  group: string
  order: number
  variant?: 'portrait' | 'square'
  className?: string
  /** Prefer a stable parent handler `(id) => …` so memo skips re-renders. */
  onSelect: (gameId: string) => void
  onFocusSelect?: () => void
  onOpen: (gameId: string) => void
}

function GameCardComponent({
  game,
  focusId,
  group,
  order,
  variant = 'portrait',
  className,
  onSelect,
  onFocusSelect,
  onOpen,
}: GameCardProps) {
  const image = gameTileImage(game.artwork, variant)
  const isSquare = variant === 'square'
  const tileImage = image
  const tilePlaceholder = placeholderGradient(game.id)
  const squareArtFit = game.artwork.icon ? 'contain' : 'cover'

  const handleActivate = () => {
    onSelect(game.id)
    onOpen(game.id)
  }

  return (
    <Focusable
      focusId={focusId}
      group={group}
      order={order}
      noRing
      onFocusSelect={onFocusSelect}
      onClick={handleActivate}
      className={clsx(
        'orbit-library-card orbit-transition shrink-0 rounded-card text-left',
        className ?? 'w-[11.5rem]',
      )}
    >
      <div className="relative overflow-hidden rounded-card bg-orbit-panel">
        {isSquare ? (
          <SquareGameArt
            image={tileImage}
            placeholder={tilePlaceholder}
            fit={squareArtFit}
            roundedClassName="rounded-none"
            className="aspect-square w-full"
          />
        ) : (
          <div
            className="relative aspect-[3/4] w-full overflow-hidden"
            style={{
              backgroundImage: tileImage ? cssUrl(tileImage) : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: tileImage ? undefined : 'rgb(var(--orbit-panel))',
            }}
          >
            {!tileImage && (
              <div className="flex h-full items-end p-3">
                <span className="font-display text-lg font-semibold leading-tight text-orbit-foreground">
                  {game.title}
                </span>
              </div>
            )}
          </div>
        )}
        {game.favorite && (
          <span className="orbit-glass-control absolute right-2 top-2 rounded-full bg-black/50 p-1.5 backdrop-blur-md">
            <Heart className="h-3.5 w-3.5 fill-rose-400 text-rose-400" />
          </span>
        )}
        <div className="min-h-[4.6rem] px-3 py-2.5">
          <p className="line-clamp-2 font-medium leading-snug text-orbit-foreground">
            {game.title}
          </p>
          <p className="mt-1 truncate text-xs uppercase tracking-wider text-orbit-muted">
            {game.provider}
          </p>
        </div>
      </div>
    </Focusable>
  )
}

/** Memoized so library/search grids skip re-renders when sibling cards update. */
export const GameCard = memo(GameCardComponent)
