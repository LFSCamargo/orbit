import { clsx } from 'clsx'
import type { DownloadStep } from '@/lib/downloadProgress'

/**
 * Where a Steam game download is, as one segment per step: finished steps
 * are full, the current one fills with its own progress when known, later
 * ones are empty. So the minutes before bytes flow still read as progress.
 */
export function DownloadStepTrack({
  step,
  fraction,
}: {
  step: DownloadStep
  /** Overall progress, 0-100, when known; it measures the current step only
   * while downloading or installing files. */
  fraction: number | null
}) {
  const measured = step.label === 'Downloading' || step.label === 'Installing files'
  const currentFill = measured && fraction !== null ? fraction : 50
  return (
    <ol
      className="m-0 flex list-none gap-1 p-0"
      aria-label={`Step ${step.index} of ${step.count}: ${step.label}`}
      data-testid="download-step-track"
    >
      {Array.from({ length: step.count }, (_, index) => {
        const number = index + 1
        const done = number < step.index || step.label === 'Installed'
        const current = number === step.index && !done
        return (
          <li
            key={number}
            aria-hidden
            data-state={done ? 'done' : current ? 'current' : 'todo'}
            className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            <span
              className={clsx(
                'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out',
                done ? 'w-full bg-white/55' : 'bg-orbit-accent',
              )}
              style={
                current ? { width: `${currentFill}%` } : done ? undefined : { width: 0 }
              }
            />
          </li>
        )
      })}
    </ol>
  )
}
