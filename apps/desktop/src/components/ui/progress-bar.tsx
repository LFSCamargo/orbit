import { clsx } from 'clsx'

/**
 * Slim progress track. A `null` value is indeterminate: a sweeping segment
 * shows the work is alive while its size is unknown, instead of an empty bar.
 */
export function ProgressBar({
  value,
  label,
  className,
  tone = 'accent',
}: {
  value: number | null
  label: string
  className?: string
  tone?: 'accent' | 'done' | 'fire'
}) {
  const percent = value === null ? null : Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      data-indeterminate={percent === null ? 'true' : undefined}
      className={clsx(
        'orbit-progress relative h-1.5 w-full overflow-hidden rounded-full bg-white/10',
        className,
      )}
    >
      {percent === null ? (
        <span className="absolute inset-y-0 left-0 w-2/5 animate-progress-sweep rounded-full bg-orbit-accent/80 motion-reduce:w-full motion-reduce:animate-pulse-soft" />
      ) : (
        <span
          className={clsx(
            'block h-full rounded-full transition-[width] duration-300 ease-out',
            tone === 'done'
              ? 'bg-[#7dffb3]'
              : tone === 'fire'
                ? 'orbit-progress-fire'
                : 'bg-orbit-accent',
          )}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  )
}
