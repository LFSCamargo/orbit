import { clsx } from 'clsx'
import { Layers, Package } from 'lucide-react'
import type { GameContentMap, GameContentSummary } from '@/types/gameContent'
import { formatContentDetail, formatContentVersion, formatDlcCount, formatDlcNamesPreview } from '@/lib/format'

interface GameContentBadgeProps {
  summary?: GameContentSummary
  className?: string
  variant?: 'switch' | 'orbit' | 'ps5'
}

export function GameContentBadge({ summary, className, variant = 'orbit' }: GameContentBadgeProps) {
  if (!summary) return null

  const hasVersion = Boolean(summary.versionLabel)
  const hasDlc = summary.dlcCount > 0

  if (!hasVersion && !hasDlc && summary.updateCount === 0) return null

  return (
    <div
      className={clsx(
        'pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1',
        className,
      )}
    >
      {hasVersion && (
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            variant === 'switch' && 'bg-black/55 text-[var(--switch-cyan)] ring-1 ring-white/10',
            variant === 'ps5' && 'bg-black/55 text-white/90 ring-1 ring-white/15',
            variant === 'orbit' && 'bg-black/60 text-white/90 ring-1 ring-white/10',
          )}
        >
          <Package className="h-3 w-3" />
          {formatContentVersion(summary.versionLabel)}
        </span>
      )}
      {hasDlc && (
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            variant === 'switch' && 'bg-black/55 text-[#ffb340] ring-1 ring-white/10',
            variant === 'ps5' && 'bg-black/55 text-[#7eb8ff] ring-1 ring-white/15',
            variant === 'orbit' && 'bg-black/60 text-amber-200 ring-1 ring-white/10',
          )}
        >
          <Layers className="h-3 w-3" />
          {formatDlcCount(summary.dlcCount)}
        </span>
      )}
    </div>
  )
}

export function heroContentStats(summary?: GameContentSummary) {
  if (!summary) return null

  return {
    versionValue: formatContentVersion(summary.versionLabel),
    versionDetail: formatContentDetail(summary),
    dlcValue: formatDlcCount(summary.dlcCount),
    dlcDetail:
      summary.dlcNames.length > 0
        ? formatDlcNamesPreview(summary.dlcNames)
        : summary.updateCount > 0
          ? `${summary.updateCount} patch file${summary.updateCount === 1 ? '' : 's'}`
          : 'Base game only',
  }
}

export type HeroContentDisplay = NonNullable<ReturnType<typeof heroContentStats>>

export function resolveHeroContentDisplay(
  contentByGameId: GameContentMap,
  gameId: string,
): HeroContentDisplay | null {
  const summary = contentByGameId[gameId]
  if (summary) return heroContentStats(summary)
  if (Object.keys(contentByGameId).length === 0) return null
  return {
    versionValue: '—',
    versionDetail: 'No version data',
    dlcValue: 'No DLC',
    dlcDetail: '—',
  }
}
