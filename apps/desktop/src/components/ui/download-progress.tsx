import {
  downloadPercent,
  downloadStatus,
  type DownloadTask,
} from '@/lib/downloadProgress'

/**
 * Reusable download progress readout. Screens pass a tracked task and this
 * renders an accessible bar plus a status line that always includes a
 * percentage when the total size is known.
 */
export function DownloadProgress({ task }: { task: DownloadTask }) {
  const percent = downloadPercent(task.progress)
  return (
    <div aria-live="polite" className="space-y-1.5" data-testid="download-progress">
      <div className="flex justify-between gap-3 text-xs text-orbit-muted">
        <span>{downloadStatus(task)}</span>
        {percent !== null && <span className="tabular-nums">{percent}%</span>}
      </div>
      <progress
        aria-label={`${task.label} progress`}
        className="h-1.5 w-full accent-orbit-accent"
        max={100}
        value={percent ?? undefined}
      />
    </div>
  )
}
