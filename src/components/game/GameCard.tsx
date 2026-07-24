import { clsx } from 'clsx'
import { Heart } from 'lucide-react'
import type { Game } from '@/types/game'
import { gameTileImage } from '@/lib/artwork'
import { Focusable } from '@/components/focus/Focusable'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { placeholderGradient } from '@/lib/format'
import { useThemeLayout } from '@/themes/useThemeLayout'

interface GameCardProps {
  game: Game
  focusId: string
  group: string
  order: number
  variant?: 'portrait' | 'square'
  className?: string
  onSelect: () => void
  onFocusSelect?: () => void
  onOpen: () => void
}

export function GameCard({
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
  const layout = useThemeLayout()
  const tileImage = image
  const tilePlaceholder = placeholderGradient(game.id)
  const squareArtFit = game.artwork.icon ? 'contain' : 'cover'

  if (layout === 'switch') {
    return (
      <Focusable
        focusId={focusId}
        group={group}
        order={order}
        noScale
        noRing
        onFocusSelect={onFocusSelect}
        onClick={() => {
          onSelect()
          onOpen()
        }}
        className={clsx('switch-card w-full shrink-0 text-left', className)}
      >
        <SquareGameArt
          image={tileImage}
          placeholder={tilePlaceholder}
          fit={squareArtFit}
          roundedClassName="rounded-[18px]"
        />
        <p className="mt-2 line-clamp-2 min-h-8 text-center text-xs font-semibold leading-snug text-[var(--switch-muted)]">
          {game.title}
        </p>
      </Focusable>
    )
  }

  if (layout === 'ps5') {
    return (
      <Focusable
        focusId={focusId}
        group={group}
        order={order}
        noScale
        noRing
        onFocusSelect={onFocusSelect}
        onClick={() => {
          onSelect()
          onOpen()
        }}
        className={clsx('ps5-card w-full shrink-0 text-left', className)}
      >
        <SquareGameArt
          image={tileImage}
          placeholder={tilePlaceholder}
          fit={squareArtFit}
          roundedClassName="rounded-xl"
        />
        <p className="mt-2 line-clamp-2 min-h-8 text-center text-xs font-semibold leading-snug text-[var(--ps5-muted)]">
          {game.title}
        </p>
      </Focusable>
    )
  }

  return (
    <Focusable
      focusId={focusId}
      group={group}
      order={order}
      noScale
      noRing
      onFocusSelect={onFocusSelect}
      onClick={() => {
        onSelect()
        onOpen()
      }}
      className={clsx(
        'orbit-library-card orbit-transition shrink-0 rounded-card text-left',
        className ?? 'w-[11.5rem]',
      )}
    >
      <div className="relative overflow-hidden rounded-card bg-orbit-panel/50">
        {isSquare ? (
          <SquareGameArt
            image={tileImage}
            placeholder={tilePlaceholder}
            fit={squareArtFit}
            roundedClassName="rounded-none"
          />
        ) : (
          <div
            className="relative aspect-[3/4] w-full overflow-hidden"
            style={{
              backgroundImage: tileImage ? `url(${tileImage})` : undefined,
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
          <span className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 backdrop-blur-md">
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
