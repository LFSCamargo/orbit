import type { Game } from '@/types/game'
import { GameCard } from './GameCard'

interface GameCarouselProps {
  title: string
  games: Game[]
  group: string
  onFocusGame: (game: Game) => void
  onOpenGame: (game: Game) => void
  onSelectGame: (game: Game) => void
}

export function GameCarousel({
  title,
  games,
  group,
  onFocusGame,
  onOpenGame,
  onSelectGame,
}: GameCarouselProps) {
  if (games.length === 0) return null

  return (
    <section className="space-y-4 px-10">
      <h2 className="font-display text-xl font-semibold tracking-wide text-white/90">
        {title}
      </h2>
      <div className="scrollbar-none flex gap-4 overflow-x-auto px-1 pb-3 pt-2">
        {games.map((game, index) => (
          <GameCard
            key={`${group}-${game.id}`}
            game={game}
            focusId={`${group}-${game.id}`}
            group={group}
            order={index}
            onFocusSelect={() => onFocusGame(game)}
            onSelect={() => onSelectGame(game)}
            onOpen={() => onOpenGame(game)}
          />
        ))}
      </div>
    </section>
  )
}
