import { clsx } from 'clsx'
import { SkeletonBlock } from '@/components/feedback/Skeleton'
import { STORAGE_CARD } from './styles'

const BAR_SHARES = ['w-[38%]', 'w-[22%]', 'w-[12%]', 'w-[8%]']
const DISTRIBUTION = ['w-[70%]', 'w-[45%]', 'w-[25%]', 'w-[12%]', 'w-[6%]']
const NAME_WIDTHS = ['w-3/5', 'w-2/5', 'w-1/2', 'w-[45%]', 'w-[55%]', 'w-1/3']

/** A card's small uppercase title. */
function Kicker({ className = 'w-28' }: { className?: string }) {
  return <SkeletonBlock className={clsx('h-2.5 rounded-full', className)} />
}

/** Storage overview: total, disk-in-use figure, share bar and legend. */
function OverviewSkeleton() {
  return (
    <div className={STORAGE_CARD} data-testid="storage-skeleton-overview">
      <Kicker />
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-2">
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
          <SkeletonBlock className="mb-1 h-3 w-20 rounded-full" />
        </div>
        <SkeletonBlock className="h-4 w-24 rounded-full" />
      </div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-white/10">
        {BAR_SHARES.map((width, index) => (
          <SkeletonBlock key={index} className={clsx('h-full rounded-none', width)} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {[16, 20, 14, 18].map((width, index) => (
          <span key={index} className="flex items-center gap-1.5">
            <SkeletonBlock className="size-2 rounded-full" />
            <SkeletonBlock
              className="h-3 rounded-full"
              style={{ width: `${width * 4}px` }}
            />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Largest installs: five rows of square art, name, size and chevron. */
function LargestSkeleton() {
  return (
    <div className={STORAGE_CARD} data-testid="storage-skeleton-largest">
      <Kicker className="w-32" />
      <div className="grid gap-1">
        {NAME_WIDTHS.slice(0, 5).map((width, index) => (
          <div key={index} className="flex items-center gap-3 px-1.5 py-1.5">
            <SkeletonBlock className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className={clsx('h-3.5 rounded-full', width)} />
            </div>
            <SkeletonBlock className="h-3 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Distribution: one labelled bar per category. */
function DistributionSkeleton() {
  return (
    <div className={STORAGE_CARD} data-testid="storage-skeleton-distribution">
      <Kicker className="w-24" />
      <div className="grid gap-3.5">
        {DISTRIBUTION.map((width, index) => (
          <div
            key={index}
            className="grid grid-cols-[18px_1fr] items-center gap-x-3 gap-y-1.5"
          >
            <SkeletonBlock className="size-[18px] rounded-md" />
            <div className="flex items-baseline justify-between gap-3">
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-3 w-16 rounded-full" />
            </div>
            <div className="col-start-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <SkeletonBlock className={clsx('h-full rounded-full', width)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Installed items: filter pills, search, sort and table rows with the
 * same columns the real table hides at each width. */
function ItemsSkeleton() {
  return (
    <div className="grid gap-4" data-testid="storage-skeleton-items">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[12, 16, 20, 14].map((width, index) => (
            <SkeletonBlock
              key={index}
              className="h-8 rounded-full"
              style={{ width: `${width * 4}px` }}
            />
          ))}
        </div>
        <SkeletonBlock className="h-9 min-w-[200px] flex-1 rounded-full sm:max-w-[260px]" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-3 w-12 rounded-full" />
        <SkeletonBlock className="h-3 w-10 rounded-full" />
        <SkeletonBlock className="h-3 w-10 rounded-full" />
      </div>
      <div>
        <div className="flex gap-3 pb-2">
          <SkeletonBlock className="h-2.5 w-12 rounded-full" />
        </div>
        {NAME_WIDTHS.map((width, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-t border-white/[0.06] py-3"
          >
            <div className="min-w-0 flex-1 pr-3">
              <SkeletonBlock className={clsx('h-3.5 rounded-full', width)} />
            </div>
            <SkeletonBlock className="h-5 w-[72px] shrink-0 rounded-full max-[700px]:hidden" />
            <SkeletonBlock className="h-3 w-[88px] shrink-0 rounded-full max-[1100px]:hidden" />
            <SkeletonBlock className="h-3 w-[60px] shrink-0 rounded-full" />
            <SkeletonBlock className="h-3 w-[88px] shrink-0 rounded-full max-[900px]:hidden" />
            <div className="flex w-[84px] shrink-0 justify-end gap-1.5">
              <SkeletonBlock className="size-7 rounded-full" />
              <SkeletonBlock className="size-7 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Settings → Storage while the first scan runs: every card in its place. */
export function StorageSkeleton() {
  return (
    <div role="status" aria-label="Loading storage" className="grid gap-5">
      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <OverviewSkeleton />
        <LargestSkeleton />
      </div>
      <DistributionSkeleton />
      <ItemsSkeleton />
    </div>
  )
}
