import { Download, ExternalLink, Gamepad2 } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { GameHubEntry } from '@/types/gamehub'

export function ConnectedGameCard({
  game,
  group,
  order,
  busy,
  onManage,
  onInstall,
}: {
  game: GameHubEntry
  group: string
  order: number
  busy: boolean
  onManage: () => void
  onInstall: (appId: string) => void
}) {
  const appId = /^steam:([1-9]\d{0,9})$/.exec(game.id)?.[1]
  const status = game.installed
    ? 'Install path available'
    : game.phase && game.phase !== 'completed'
      ? game.phase
      : 'Available in GameHub'
  return (
    <article className="orbit-panel flex min-w-0 flex-col rounded-card p-4">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-orbit-muted">
        <Gamepad2 size={16} /> GameHub · {game.store}
      </div>
      <h3 className="break-words text-lg font-semibold">{game.title}</h3>
      <p className="mt-1 text-sm capitalize text-orbit-muted">
        {status}
        {game.percent !== null && game.phase !== 'completed'
          ? ` · ${Math.round(game.percent)}%`
          : ''}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Focusable
          focusId={`${group}-connected-${game.id}`}
          group={group}
          order={order * 2}
          disabled={busy}
          noScale
          onClick={onManage}
          aria-label={`Manage ${game.title} in GameHub`}
          className="orbit-glass-control flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs"
        >
          <ExternalLink size={14} /> GameHub
        </Focusable>
        {!game.installed && appId && (
          <Focusable
            focusId={`${group}-install-${game.id}`}
            group={group}
            order={order * 2 + 1}
            disabled={busy}
            noScale
            onClick={() => onInstall(appId)}
            aria-label={`Check Mac install for ${game.title} in Steam`}
            className="orbit-glass-control flex items-center gap-2 rounded-xl bg-orbit-accent/20 px-3 py-2 text-xs"
          >
            <Download size={14} /> Check Steam install
          </Focusable>
        )}
      </div>
    </article>
  )
}
