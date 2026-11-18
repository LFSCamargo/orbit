import { useRef } from 'react'
import { clsx } from 'clsx'
import { Heart, HardDrive, Download } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SourceIcon } from '@/components/game/SourceIcon'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { gameTileFit, gameTileImage } from '@/lib/artwork'
import { gameSource, SOURCE_LABELS } from '@/lib/gameSource'
import { formatBytes, placeholderGradient } from '@/lib/format'
import { entrySizes } from '@/lib/libraryEntries'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'
import { useLibraryViewportFade } from '../hooks/useLibraryViewportFade'

export function LibraryEntryGrid({
  entries,
  screen = 'library',
  orderOffset = 0,
  label = 'Games',
}: {
  entries: LibraryEntry[]
  screen?: string
  /** Focus order of the first tile, so sections continue one sequence. */
  orderOffset?: number
  label?: string
}) {
  const open = useUiStore((s) => s.openGameDetails)
  const gridRef = useRef<HTMLDivElement>(null)
  useLibraryViewportFade(gridRef)
  return (
    <div
      ref={gridRef}
      className={clsx(
        'library-entry-grid',
        '[contain:layout_paint]',
        'grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-6 max-[1100px]:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-[1100px]:gap-[18px]',
      )}
      role="list"
      aria-label={label}
    >
      {entries.map((entry, index) => {
        const order = orderOffset + index
        const available = entry.installations.some((i) => i.available)
        const source = gameSource(entry.game)
        return (
          <div key={entry.id} role="listitem" className="min-w-0">
            <Focusable
              focusId={`${screen}-game-${entry.id}`}
              group={`${screen}-grid`}
              order={order}
              noScale
              noRing
              className={clsx(
                'library-entry-card orbit-art-focus orbit-panel w-full rounded-[22px] text-left transition-[background,transform] duration-200',
                'data-[focused=true]:z-10',
                'hover:-translate-y-[3px] hover:bg-[rgb(56_61_72/0.8)]',
                'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
              )}
              aria-label={entry.game.title}
              onClick={() => open(entry.id)}
            >
              <div className="orbit-art-focus-target rounded-[22px]">
                <div
                  className={clsx(
                    'library-entry-art relative aspect-square overflow-hidden rounded-[22px]',
                  )}
                >
                  <SquareGameArt
                    image={gameTileImage(entry.game.artwork, 'square')}
                    placeholder={placeholderGradient(entry.id)}
                    fit={gameTileFit(entry.game.artwork, 'square')}
                    roundedClassName="rounded-none"
                    className="aspect-square w-full"
                  />
                  {source !== 'other' && (
                    <span
                      className={clsx(
                        'library-source absolute left-3 top-3 grid size-[30px] place-items-center rounded-full bg-[rgb(20_22_28/0.72)] text-white/90 backdrop-blur-[12px]',
                      )}
                    >
                      <SourceIcon
                        source={source}
                        size={15}
                        label={SOURCE_LABELS[source]}
                      />
                    </span>
                  )}
                  {entry.game.favorite && (
                    <span
                      className={clsx(
                        'library-favorite absolute right-3 top-3 rounded-full bg-[rgb(20_22_28/0.8)] p-[9px] text-[#ffa2b6] backdrop-blur-[12px]',
                      )}
                      aria-label="Favorite"
                    >
                      <Heart size={16} fill="currentColor" />
                    </span>
                  )}
                </div>
              </div>
              <div className={clsx('library-entry-copy min-h-[88px] p-4')}>
                <h2 className={clsx('truncate text-base font-semibold')}>
                  {entry.game.title}
                </h2>
                <p
                  className={clsx(
                    'mt-[7px] flex items-center gap-1.5 text-xs text-orbit-muted',
                  )}
                >
                  {available ? <HardDrive size={14} /> : <Download size={14} />}
                  {available
                    ? installedLabel(entry)
                    : entry.installations.length
                      ? 'Unavailable'
                      : 'Not installed'}
                  {entry.installations.length > 1 &&
                    ` · ${entry.installations.length} installations`}
                </p>
              </div>
            </Focusable>
          </div>
        )
      })}
    </div>
  )
}

function installedLabel(entry: LibraryEntry): string {
  const { diskBytes } = entrySizes(entry)
  return diskBytes ? `Installed · ${formatBytes(diskBytes)}` : 'Installed'
}
