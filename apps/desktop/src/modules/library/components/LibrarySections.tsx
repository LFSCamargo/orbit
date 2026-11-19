import { clsx } from 'clsx'
import { SourceIcon } from '@/components/game/SourceIcon'
import { groupBySource, SOURCE_LABELS } from '@/lib/gameSource'
import type { LibraryEntry } from '@/types/library'
import { LibraryEntryGrid } from './LibraryEntryGrid'

/** The library split by where games play from (Steam for Mac, Steam for
 * Windows, Astris, others). A single source stays one plain grid. */
export function LibrarySections({
  entries,
  screen = 'library',
}: {
  entries: LibraryEntry[]
  screen?: string
}) {
  const sections = groupBySource(entries)
  if (sections.length <= 1) return <LibraryEntryGrid entries={entries} screen={screen} />
  let offset = 0
  return (
    <div className="library-sections flex flex-col gap-10">
      {sections.map((section) => {
        const orderOffset = offset
        offset += section.entries.length
        const label = SOURCE_LABELS[section.source]
        return (
          <section key={section.source} aria-label={label}>
            <h2
              className={clsx(
                'library-section-title mb-4 flex items-center gap-2.5 font-display text-lg font-semibold text-white/90',
              )}
            >
              <SourceIcon source={section.source} size={18} />
              {label}
              <span className="text-sm font-normal text-orbit-muted">
                {section.entries.length}
              </span>
            </h2>
            <LibraryEntryGrid
              entries={section.entries}
              screen={screen}
              orderOffset={orderOffset}
              label={label}
            />
          </section>
        )
      })}
    </div>
  )
}
