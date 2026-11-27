import { Pause, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useNow } from '@/hooks/useNow'
import {
  downloadFraction,
  downloadStatus,
  downloadStep,
  elapsedSeconds,
  formatDuration,
  formatPercent,
  formatTimeLeft,
  formatTransferRate,
  formatTransferSize,
  timeLeft,
  type DownloadTask,
} from '@/lib/downloadProgress'
import { DownloadArtwork } from './DownloadArtwork'
import { DownloadSpeedGraph } from './DownloadSpeedGraph'
import { DownloadStepTrack } from './DownloadStepTrack'
import { ICON_BUTTON, ROW } from './styles'

/** "3.65 GB of 107.6 GB" from any phase that reports bytes. */
function amountOf(done: number | undefined, total: number | undefined): string | null {
  if (!total || total <= 0) return null
  return `${formatTransferSize(done ?? 0)} of ${formatTransferSize(total)}`
}

/**
 * One transfer, read like Steam's downloads page: what it is doing and how
 * much is done, a bar that fills to the exact amount, speed, peak, time left
 * and what is already written to disk, the speed over time, and for
 * games, which of the seven steps it is on. The clock ticks while it runs.
 */
export function DownloadRow({
  task,
  appId,
  coverUrl,
  order,
  onPause,
  onCancel,
  onDismiss,
}: {
  task: DownloadTask
  appId: string | null
  coverUrl?: string | null
  order: number
  onPause?: () => void
  onCancel?: () => void
  /** Removes a finished row from the list. */
  onDismiss?: () => void
}) {
  const progress = task.progress
  const fraction = downloadFraction(progress)
  const percent = formatPercent(fraction)
  const downloading = progress?.phase === 'Downloading'
  const done = progress?.phase === 'Ready'
  const step = downloadStep(task)
  const now = useNow(1_000, !done)
  const rate = task.rate ?? null
  const left = timeLeft(progress, rate)

  const phase = done ? 'Installed' : (step?.label ?? downloadStatus(task))
  const amount =
    progress && 'totalBytes' in progress
      ? amountOf(progress.downloadedBytes, progress.totalBytes)
      : null
  const stats = done
    ? []
    : [
        downloading && left !== null ? `${formatTimeLeft(left)} left` : null,
        downloading && progress.stageTotalBytes
          ? `On disk ${amountOf(progress.stagedBytes, progress.stageTotalBytes)}`
          : null,
        `Elapsed ${formatDuration(elapsedSeconds(task.startedAt, now))}`,
      ].filter(Boolean)

  return (
    <div className={ROW} data-testid="download-row" aria-live="polite">
      <DownloadArtwork appId={appId} preferred={coverUrl} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="truncate text-[13px] font-[650]">{task.label}</strong>
          {downloading && (
            <span
              className="shrink-0 text-[12px] font-[650] tabular-nums text-white/85"
              data-testid="download-rate"
            >
              {formatTransferRate(rate)}
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="truncate text-white/70">
            <span className="font-[600] text-white/85">{phase}</span>
            {amount && <span className="tabular-nums"> · {amount}</span>}
          </span>
          {percent && (
            <span className="shrink-0 font-[600] tabular-nums text-white/85">
              {percent}
            </span>
          )}
        </div>
        <ProgressBar
          label={`${task.label} progress`}
          value={fraction}
          live={!done && fraction !== null}
          tone={done ? 'done' : 'accent'}
          size="md"
        />
        {stats.length > 0 && (
          <span
            className="truncate text-[11px] tabular-nums text-white/50"
            data-testid="download-timing"
          >
            {stats.join(' · ')}
          </span>
        )}
        {downloading && task.history && task.history.length > 1 && (
          <DownloadSpeedGraph samples={task.history} peak={task.peak ?? 0} />
        )}
        {step && !done && (
          <div className="grid gap-1">
            <DownloadStepTrack step={step} fraction={fraction} />
            <span className="text-[10px] leading-none text-white/45">
              Step {step.index} of {step.count}
            </span>
          </div>
        )}
      </div>
      {onPause && (
        <Focusable
          focusId={`download-pause-${task.key}`}
          group="steam-activity"
          order={order}
          noScale
          aria-label={`Pause ${task.label}`}
          className={ICON_BUTTON}
          onClick={onPause}
        >
          <Pause size={14} fill="currentColor" />
        </Focusable>
      )}
      {(onCancel ?? onDismiss) && (
        <Focusable
          focusId={`download-cancel-${task.key}`}
          group="steam-activity"
          order={order}
          noScale
          aria-label={onCancel ? `Cancel ${task.label}` : `Dismiss ${task.label}`}
          className={ICON_BUTTON}
          onClick={onCancel ?? onDismiss}
        >
          <X size={14} />
        </Focusable>
      )}
    </div>
  )
}
