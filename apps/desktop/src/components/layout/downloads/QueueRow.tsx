import { Play, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { QueuedDownload } from '@/types/downloads'
import { DownloadArtwork } from './DownloadArtwork'
import { ICON_BUTTON, ROW } from './styles'

/** A title waiting for its turn. Play runs it next; X takes it out of the queue. */
export function QueueRow({
  item,
  position,
  waitingForNetwork = false,
  order,
  onStart,
  onRemove,
}: {
  item: QueuedDownload
  position: number
  /** Offline: an unpaused title resumes on its own once the network is back. */
  waitingForNetwork?: boolean
  order: number
  onStart: () => void
  onRemove: () => void
}) {
  return (
    <div className={ROW} data-testid="queue-row">
      <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-white/45">
        {position}
      </span>
      <DownloadArtwork appId={item.appId} preferred={item.coverUrl} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <strong className="truncate text-[13px] font-[650]">{item.title}</strong>
        <span className="text-[11px] text-white/60">
          {item.paused ? 'Paused' : waitingForNetwork ? 'Waiting for network' : 'Waiting'}
        </span>
      </div>
      <Focusable
        focusId={`queue-start-${item.appId}`}
        group="steam-activity"
        order={order}
        noScale
        aria-label={item.paused ? `Resume ${item.title}` : `Download ${item.title} next`}
        className={ICON_BUTTON}
        onClick={onStart}
      >
        <Play size={14} fill="currentColor" />
      </Focusable>
      <Focusable
        focusId={`queue-remove-${item.appId}`}
        group="steam-activity"
        order={order}
        noScale
        aria-label={`Remove ${item.title} from the queue`}
        className={ICON_BUTTON}
        onClick={onRemove}
      >
        <X size={14} />
      </Focusable>
    </div>
  )
}
