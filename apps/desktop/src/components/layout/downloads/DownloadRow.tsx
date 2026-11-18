import { Pause, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ProgressBar } from '@/components/ui/progress-bar'
import {
  downloadPercent,
  downloadStatus,
  downloadStep,
  formatTransferRate,
  transferredOf,
  type DownloadTask,
} from '@/lib/downloadProgress'
import { DownloadArtwork } from './DownloadArtwork'
import { ICON_BUTTON, ROW } from './styles'

/** One running transfer: cover, title, speed, bytes and a live bar. */
export function DownloadRow({
  task,
  appId,
  coverUrl,
  rate,
  order,
  onPause,
  onCancel,
  onDismiss,
}: {
  task: DownloadTask
  appId: string | null
  coverUrl?: string | null
  rate: number | null
  order: number
  onPause?: () => void
  onCancel?: () => void
  /** Removes a finished row from the list. */
  onDismiss?: () => void
}) {
  const percent = downloadPercent(task.progress)
  const downloading = task.progress?.phase === 'Downloading'
  const done = task.progress?.phase === 'Ready'
  const step = downloadStep(task)
  const bytes = transferredOf(task.progress)
  const detail = done
    ? 'Installed'
    : step
      ? [`${step.index}/${step.count} · ${step.label}`, bytes].filter(Boolean).join(' · ')
      : (bytes ?? downloadStatus(task))
  return (
    <div className={ROW} data-testid="download-row" aria-live="polite">
      <DownloadArtwork appId={appId} preferred={coverUrl} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="truncate text-[13px] font-[650]">{task.label}</strong>
          {downloading && (
            <span className="shrink-0 text-[11px] tabular-nums text-white/70">
              {formatTransferRate(task.rate ?? rate)}
            </span>
          )}
        </div>
        <span className="truncate text-[11px] text-white/60">{detail}</span>
        <div className="flex items-center gap-2">
          <ProgressBar
            label={`${task.label} progress`}
            value={percent}
            tone={done ? 'done' : 'accent'}
          />
          {percent !== null && (
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/70">
              {percent}%
            </span>
          )}
        </div>
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
