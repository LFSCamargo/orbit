import { GameCard } from '@/components/game/GameCard'
import { useUiStore } from '@/stores/ui.store'
import type { Game } from '@/types/game'

export function CollectionGrid({
  games,
  screen,
}: {
  games: Game[]
  screen: 'library' | 'search'
}) {
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  return (
    <section aria-labelledby={`${screen}-collection-title`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id={`${screen}-collection-title`} className="text-xl font-semibold">
          Orbit games
        </h2>
        <p className="text-sm text-orbit-muted">
          {games.length} {games.length === 1 ? 'game' : 'games'}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-4">
        {games.map((game, index) => (
          <GameCard
            key={game.id}
            game={game}
            variant="square"
            className="w-full"
            focusId={`${screen}-game-${game.id}`}
            group={`${screen}-grid`}
            order={index}
            onSelect={setHeroGameId}
            onOpen={openGameDetails}
          />
        ))}
      </div>
      {!games.length && (
        <p className="text-sm text-orbit-muted">No Orbit games match these filters.</p>
      )}
    </section>
  )
}
