import { useState } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SourceIcon } from '@/components/game/SourceIcon'
import { groupBySource, SOURCE_LABELS, type GameSource } from '@/lib/gameSource'
import { useUiStore } from '@/stores/ui.store'
import type { LibraryEntry } from '@/types/library'
import { LibraryEntryGrid } from './LibraryEntryGrid'

/** Tiles shown per section before "Show more". */
export const SECTION_PAGE_SIZE = 24

/** The library split by where games play from (Steam for Mac, Steam for
 * Windows, Astris, Xbox Cloud Gaming, others). Each section collapses and
 * pages on its own; a search shows every section open. */
export function LibrarySections({
  entries,
  screen = 'library',
  searching = false,
}: {
  entries: LibraryEntry[]
  screen?: string
  searching?: boolean
}) {
  const collapsed = useUiStore((s) => s.librarySectionsCollapsed)
  const setCollapsed = useUiStore((s) => s.setLibrarySectionsCollapsed)
  const [shown, setShown] = useState<Partial<Record<GameSource, number>>>({})
  const sections = groupBySource(entries)
  if (sections.length <= 1 && entries.length <= SECTION_PAGE_SIZE) {
    return <LibraryEntryGrid entries={entries} screen={screen} />
  }
  const allCollapsed = sections.every((section) => collapsed.includes(section.source))
  const toggle = (source: GameSource) =>
    setCollapsed(
      collapsed.includes(source)
        ? collapsed.filter((item) => item !== source)
        : [...collapsed, source],
    )
  let offset = 0
  return (
    <div className="library-sections flex flex-col gap-10">
      {!searching && sections.length > 1 && (
        <Focusable
          focusId={`${screen}-sections-toggle`}
          group={`${screen}-sections`}
          order={0}
          noScale
          onClick={() =>
            setCollapsed(allCollapsed ? [] : sections.map((section) => section.source))
          }
          className="orbit-glass-control -mb-6 inline-flex items-center gap-2 self-end rounded-full bg-white/10 px-4 py-2 text-xs font-semibold"
        >
          {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </Focusable>
      )}
      {sections.map((section, index) => {
        const orderOffset = offset
        offset += section.entries.length
        const label = SOURCE_LABELS[section.source]
        const open = searching || !collapsed.includes(section.source)
        const limit = searching
          ? section.entries.length
          : (shown[section.source] ?? SECTION_PAGE_SIZE)
        const visible = section.entries.slice(0, limit)
        const remaining = section.entries.length - visible.length
        const panelId = `${screen}-section-${section.source}`
        return (
          <section key={section.source} aria-label={label}>
            <h2 className="library-section-title mb-4 font-display text-lg font-semibold text-white/90">
              <Focusable
                focusId={`${screen}-section-toggle-${section.source}`}
                group={`${screen}-sections`}
                order={index + 1}
                noScale
                noRing
                disabled={searching}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(section.source)}
                className="flex items-center gap-2.5 rounded-full py-1 pr-3 text-left"
              >
                <ChevronDown
                  size={18}
                  className={clsx(
                    'text-white/50 transition-transform motion-reduce:transition-none',
                    !open && '-rotate-90',
                  )}
                />
                <SourceIcon source={section.source} size={18} />
                {label}
                <span className="text-sm font-normal text-orbit-muted">
                  {section.entries.length}
                </span>
              </Focusable>
            </h2>
            <div id={panelId} hidden={!open}>
              {open && (
                <LibraryEntryGrid
                  entries={visible}
                  screen={screen}
                  orderOffset={orderOffset}
                  label={label}
                />
              )}
              {open && remaining > 0 && (
                <Focusable
                  focusId={`${screen}-section-more-${section.source}`}
                  group={`${screen}-section-more`}
                  order={index}
                  noScale
                  onClick={() =>
                    setShown((current) => ({
                      ...current,
                      [section.source]: limit + SECTION_PAGE_SIZE,
                    }))
                  }
                  className="orbit-glass-control mt-5 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold"
                >
                  Show more · {remaining} left
                </Focusable>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
