import { clsx } from 'clsx'
import { SkeletonBlock } from '@/components/feedback/Skeleton'

/** Same group and row geometry as the Compatibility screens, so nothing
 * jumps when the real rows arrive. */
const ROW_GROUP = clsx(
  'settings-row-group overflow-hidden rounded-[18px] border border-orbit-foreground/10',
  'bg-orbit-foreground/[0.035] shadow-[inset_0_1px_0_rgb(var(--orbit-foreground)/0.035)]',
)
const ROW = clsx(
  'grid min-h-[78px] grid-cols-[34px_minmax(0,1fr)_minmax(130px,34%)] items-center gap-3.5 p-4',
  'even:bg-orbit-foreground/[0.035]',
  'max-[700px]:grid-cols-[36px_minmax(0,1fr)]',
)

/** Detail lines vary in width so the rows read as real copy, not stripes. */
const DETAIL_WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4']

function SkeletonRow({
  index,
  control,
}: {
  index: number
  control: 'select' | 'switch' | 'install'
}) {
  return (
    <div className={ROW} data-testid="compatibility-skeleton-row">
      <SkeletonBlock className="size-[34px] rounded-xl" />
      <div className="grid min-w-0 gap-2">
        <SkeletonBlock className="h-3.5 w-32 max-w-[60%] rounded-full" />
        <SkeletonBlock
          className={clsx(
            'h-3 rounded-full',
            DETAIL_WIDTHS[index % DETAIL_WIDTHS.length],
          )}
        />
      </div>
      <div className="flex items-center justify-end gap-2 max-[700px]:col-start-2 max-[700px]:justify-start">
        {control === 'switch' ? (
          <SkeletonBlock className="h-6 w-11 rounded-full" />
        ) : (
          <SkeletonBlock className="h-8 w-full max-w-[180px] rounded-lg" />
        )}
        {control === 'install' && (
          <SkeletonBlock className="h-8 w-20 shrink-0 rounded-full" />
        )}
      </div>
    </div>
  )
}

/** Compatibility components loading: one row per component with its
 * version picker and Install button. */
export function ComponentRowsSkeleton({
  label = 'Loading online versions',
  rows = 5,
}: {
  label?: string
  rows?: number
}) {
  return (
    <div role="status" aria-label={label} className={ROW_GROUP}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} index={index} control="install" />
      ))}
    </div>
  )
}

const SECTIONS: { rows: ('select' | 'switch')[] }[] = [
  { rows: ['select', 'select', 'select', 'switch'] },
  { rows: ['select', 'select', 'switch', 'switch', 'switch'] },
  { rows: ['switch'] },
]

/** Compatibility settings loading: the "Recommended by default" header and
 * its three sections (title, description, rows of selects and switches). */
export function CompatibilitySettingsSkeleton({
  label = 'Loading settings',
}: {
  label?: string
}) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-xl flex-1 items-start gap-3">
          <SkeletonBlock className="mt-0.5 size-[18px] shrink-0 rounded-md" />
          <div className="grid flex-1 gap-2">
            <SkeletonBlock className="h-3.5 w-44 rounded-full" />
            <SkeletonBlock className="h-3 w-full max-w-md rounded-full" />
          </div>
        </div>
        <SkeletonBlock className="h-8 w-36 rounded-full" />
      </div>
      {SECTIONS.map((section, sectionIndex) => (
        <section key={sectionIndex} className="pt-2">
          <SkeletonBlock className="h-4 w-48 rounded-full" />
          <SkeletonBlock className="mb-4 mt-2 h-3 w-full max-w-lg rounded-full" />
          <div className={ROW_GROUP}>
            {section.rows.map((control, index) => (
              <SkeletonRow key={index} index={index + sectionIndex} control={control} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
