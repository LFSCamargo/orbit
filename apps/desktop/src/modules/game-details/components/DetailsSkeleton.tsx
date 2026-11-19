import { clsx } from 'clsx'
import { SkeletonBlock } from '@/components/feedback/Skeleton'

/** The details page while its game loads: the hero's eyebrow, title, facts
 * and command bar on the left and the tilted cover on the right, as shimmer
 * shapes in the same places. */
export function DetailsSkeleton({ className }: { className?: string }) {
  return (
    <section
      role="status"
      aria-label="Loading your game"
      data-theme="macos"
      className={clsx(
        'details-skeleton flex min-h-[clamp(360px,46vh,630px)] items-end justify-between gap-10 px-10 pb-10 pt-24',
        className,
      )}
    >
      <div className="grid w-full max-w-[640px] gap-4">
        <SkeletonBlock className="h-3 w-36 rounded-full" />
        <SkeletonBlock className="h-12 w-4/5 rounded-[14px]" />
        <div className="flex gap-3">
          <SkeletonBlock className="h-4 w-24 rounded-full" />
          <SkeletonBlock className="h-4 w-20 rounded-full" />
          <SkeletonBlock className="h-4 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="mt-3 h-[58px] w-[360px] max-w-full rounded-full" />
      </div>
      <SkeletonBlock className="mr-10 aspect-[2/3] w-[165px] shrink-0 rotate-[5deg] transform-gpu rounded-[20px] max-[520px]:hidden min-[1700px]:w-[200px]" />
    </section>
  )
}
