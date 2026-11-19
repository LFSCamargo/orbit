import { ChevronRight, Gamepad2, HardDrive } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Focusable } from '@/components/focus/Focusable'
import { formatBytes } from '@/lib/format'
import { useUiStore } from '@/stores/ui.store'
import type { StorageItem } from '@/types/storage'
import { largestGames } from './storageModel'
import { KICKER, STORAGE_CARD } from './styles'

export function LargestInstalls({ items }: { items: StorageItem[] }) {
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const games = largestGames(items)
  return (
    <section className={STORAGE_CARD} aria-label="Largest installs">
      <p className={KICKER}>LARGEST INSTALLS</p>
      {games.length === 0 && (
        <EmptyState
          size="sm"
          icon={HardDrive}
          title="No games installed by Orbit yet"
          description="Games Orbit installs, and the space they take, appear here."
        />
      )}
      <ul className="m-0 grid list-none gap-1 p-0">
        {games.map((game, index) => (
          <li key={game.id}>
            <Focusable
              focusId={`storage-largest-${game.id}`}
              group="settings-storage"
              order={index + 1}
              noScale
              className="flex w-full items-center gap-3 rounded-[12px] px-1.5 py-1.5 text-left hover:bg-white/5"
              disabled={!game.entryId}
              onClick={() => {
                if (game.entryId) openGameDetails(game.entryId)
              }}
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10">
                {game.artwork ? (
                  <img src={game.artwork} alt="" className="size-full object-cover" />
                ) : (
                  <Gamepad2 size={16} aria-hidden />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {game.name}
              </span>
              <span className="text-[13px] tabular-nums text-orbit-muted">
                {formatBytes(game.sizeBytes)}
              </span>
              <ChevronRight size={14} className="opacity-50" aria-hidden />
            </Focusable>
          </li>
        ))}
      </ul>
    </section>
  )
}
