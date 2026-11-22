import { ArrowDownToLine } from 'lucide-react'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { ProgressBar } from '@/components/ui/progress-bar'
import { queuePosition, useDownloadQueue } from '@/hooks/useDownloadQueue'
import {
  downloadPercent,
  downloadStatus,
  downloadStep,
  useDownloadStore,
} from '@/lib/downloadProgress'
import { progressLines } from '@/hooks/useDownloadToasts'
import { msStoreProductId } from '@/lib/libraryEntries'
import type { LibraryEntry } from '@/types/library'

/**
 * Glass status panel beside the details command bar: what Steam or Microsoft Store
 * is doing with this game right now. Hidden when nothing is running or queued.
 */
export function DetailsDownloadStatus({ entry }: { entry: LibraryEntry }) {
  const productId = msStoreProductId(entry)
  const queueId = entry.steamAppId ?? productId
  const key = entry.steamAppId
    ? `steam:${entry.steamAppId}`
    : productId
      ? `msstore:${productId}`
      : null
  const task = useDownloadStore((state) => (key ? state.tasks[key] : undefined))
  const queue = useDownloadQueue()
  const waiting = queuePosition(queue, queueId)
  const running = task && task.progress?.phase !== 'Ready'
  if (!running && !waiting) return null
  const percent = running ? downloadPercent(task.progress) : null
  const step = running ? downloadStep(task) : null
  const heading = !running
    ? 'Queued'
    : step
      ? `${step.index}/${step.count} · ${step.label}`
      : downloadStatus(task)
  // Speed and bytes while downloading; the queue place while waiting.
  const detail = running ? progressLines(task).message : `#${waiting} in line`
  return (
    <LiquidGlass
      surface="toolbar"
      radius={999}
      role="status"
      aria-label={`${entry.game.title} download`}
      data-testid="details-download-status"
      className="details-download-status min-w-[200px] max-w-[340px] flex-1 border border-white/[0.145] shadow-[inset_0_1px_#ffffff15,0_12px_32px_#0002] max-[760px]:max-w-full"
      contentClassName="flex h-[60px] items-center gap-3 pl-2 pr-5"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/10">
        <ArrowDownToLine size={16} aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-baseline justify-between gap-3 text-[11px] leading-none">
          <span className="truncate font-semibold text-white/90">{heading}</span>
          {percent !== null && (
            <span className="shrink-0 tabular-nums text-white/90">{percent}%</span>
          )}
        </div>
        <ProgressBar label={`${entry.game.title} progress`} value={percent} />
        {detail && (
          <span
            className="truncate text-[10px] tabular-nums leading-none text-white/60"
            title={detail}
          >
            {detail}
          </span>
        )}
      </div>
    </LiquidGlass>
  )
}
