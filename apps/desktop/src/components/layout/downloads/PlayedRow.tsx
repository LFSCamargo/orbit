import { ArrowDownToLine, ChevronRight } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { formatPlaytime } from '@/lib/format'
import type { LibraryEntry } from '@/types/library'
import { DownloadArtwork } from './DownloadArtwork'
import { ICON_BUTTON, ROW } from './styles'

/** A game you have played that is not on this Mac: Steam games install into
 * the queue; others open their details. */
export function PlayedRow({
  entry,
  order,
  queued,
  onInstall,
  onOpen,
}: {
  entry: LibraryEntry
  order: number
  queued: boolean
  onInstall?: () => void
  onOpen: () => void
}) {
  const { game } = entry
  const played =
    game.totalPlaytimeSeconds > 0
      ? `${formatPlaytime(game.totalPlaytimeSeconds)} played`
      : 'Played'
  return (
    <div className={ROW} data-testid="played-row">
      <DownloadArtwork appId={entry.steamAppId} preferred={game.artwork.cover} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <strong className="truncate text-[13px] font-[650]">{game.title}</strong>
        <span className="text-[11px] text-white/60">{queued ? 'In queue' : played}</span>
      </div>
      {onInstall ? (
        <Focusable
          focusId={`steam-played-install-${entry.id}`}
          group="steam-activity"
          order={order}
          noScale
          disabled={queued}
          aria-label={`Install ${game.title}`}
          className={ICON_BUTTON}
          onClick={onInstall}
        >
          <ArrowDownToLine size={14} />
        </Focusable>
      ) : (
        <Focusable
          focusId={`steam-played-open-${entry.id}`}
          group="steam-activity"
          order={order}
          noScale
          aria-label={`Open ${game.title}`}
          className={ICON_BUTTON}
          onClick={onOpen}
        >
          <ChevronRight size={14} />
        </Focusable>
      )}
    </div>
  )
}
