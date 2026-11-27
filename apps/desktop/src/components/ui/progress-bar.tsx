import { clsx } from 'clsx'

/**
 * Slim progress track. A `null` value is indeterminate: a sweeping segment
 * shows the work is alive while its size is unknown, instead of an empty bar.
 *
 * Known progress fills to the exact (unrounded) value and glides between
 * updates, like Steam's bar. `live` runs a soft sheen across the fill so a slow
 * transfer still reads as moving.
 */
export function ProgressBar({
  value,
  label,
  className,
  tone = 'accent',
  live = false,
  size = 'sm',
}: {
  value: number | null
  label: string
  className?: string
  tone?: 'accent' | 'done' | 'fire'
  live?: boolean
  size?: 'sm' | 'md'
}) {
  const percent = value === null ? null : clamp(value)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : Math.floor(percent)}
      aria-valuetext={percent === null ? undefined : `${Math.floor(percent * 10) / 10}%`}
      data-indeterminate={percent === null ? 'true' : undefined}
      className={clsx(
        'orbit-progress relative w-full overflow-hidden rounded-full bg-white/10',
        size === 'md' ? 'h-2' : 'h-1.5',
        className,
      )}
    >
      {percent === null ? (
        <span className="absolute inset-y-0 left-0 w-2/5 animate-progress-sweep rounded-full bg-orbit-accent/80 motion-reduce:w-full motion-reduce:animate-pulse-soft" />
      ) : (
        <>
          <span
            className={clsx(
              'relative z-[1] block h-full overflow-hidden rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none',
              tone === 'done'
                ? 'bg-[#7dffb3]'
                : tone === 'fire'
                  ? 'orbit-progress-fire'
                  : 'bg-orbit-accent',
            )}
            style={{ width: `${percent}%` }}
          >
            {live && (
              <span
                aria-hidden
                data-testid="progress-sheen"
                className="absolute inset-y-0 -left-1/2 w-1/2 animate-progress-sheen bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.45),transparent)] motion-reduce:hidden"
              />
            )}
          </span>
        </>
      )}
    </div>
  )
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}
