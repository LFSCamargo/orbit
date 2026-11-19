import { clsx } from 'clsx'
import { SkeletonBlock as Shimmer } from '@/components/feedback/Skeleton'
import { LIBRARY_CARD_SHELL, LIBRARY_ENTRY_GRID } from './libraryGrid'

/** Loading placeholders shaped like the library's cards, in the same grid:
 * a section heading, then glass cards with square art, a title line and a
 * status line. Fixed work independent of catalog size; placeholders never
 * register focus targets. */
export function LibrarySkeleton({ label, count = 8 }: { label: string; count?: number }) {
  return (
    <div role="status" aria-label={label}>
      <span className="sr-only">{label}…</span>
      <div className="mb-4 flex items-center gap-2.5" aria-hidden="true">
        <Shimmer className="size-5 rounded-full" />
        <Shimmer className="h-4 w-28 rounded-full" />
      </div>
      <div className={clsx('library-skeleton-grid', LIBRARY_ENTRY_GRID)}>
        {Array.from({ length: count }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className={clsx('library-skeleton-card overflow-hidden', LIBRARY_CARD_SHELL)}
          >
            <Shimmer className="aspect-square w-full rounded-[22px]" />
            <div className="min-h-[88px] p-4">
              <Shimmer className="h-4 w-3/4 rounded-full" />
              <div className="mt-[11px] flex items-center gap-1.5">
                <Shimmer className="size-3.5 rounded-full" />
                <Shimmer className="h-3 w-2/5 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
