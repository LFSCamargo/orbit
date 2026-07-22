import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Library } from 'lucide-react'
import { useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { kindLabel } from '@/hooks/useSwitchLibrary'
import { formatBytes } from '@/lib/format'
import type { SwitchContentKind, SwitchRomEntry, SwitchTitleGroup } from '@/types/switch'
import { useThemeLayout } from '@/themes/useThemeLayout'

function kindBadgeClass(kind: SwitchContentKind, layout: ReturnType<typeof useThemeLayout>) {
  const base =
    kind === 'base'
      ? 'bg-emerald-500/20 text-emerald-100 ring-emerald-400/30'
      : kind === 'update'
        ? 'bg-sky-500/20 text-sky-100 ring-sky-400/30'
        : kind === 'dlc'
          ? 'bg-amber-500/20 text-amber-100 ring-amber-400/30'
          : 'bg-white/10 text-white/70 ring-white/15'

  if (layout === 'switch' && kind === 'base') {
    return 'bg-[var(--switch-cyan)]/15 text-[var(--switch-cyan)] ring-[var(--switch-cyan)]/30'
  }
  if (layout === 'ps5' && kind === 'base') {
    return 'bg-[var(--ps5-accent)]/20 text-[var(--ps5-ink)] ring-[var(--ps5-accent)]/40'
  }
  return base
}

function RomRow({ entry, layout }: { entry: SwitchRomEntry; layout: ReturnType<typeof useThemeLayout> }) {
  const muted =
    layout === 'switch'
      ? 'text-[var(--switch-muted)]'
      : layout === 'ps5'
        ? 'text-[var(--ps5-muted)]'
        : 'text-orbit-muted'

  return (
    <div className="rounded-xl bg-black/20 px-4 py-3 ring-1 ring-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1',
            kindBadgeClass(entry.kind, layout),
          )}
        >
          {kindLabel(entry.kind)}
        </span>
        {entry.version && (
          <span className={clsx('text-xs font-mono', muted)}>{entry.version}</span>
        )}
        {entry.titleId && (
          <span className={clsx('text-xs font-mono', muted)}>{entry.titleId}</span>
        )}
        {entry.inLibrary && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80">
            In Orbit
          </span>
        )}
        <span className={clsx('ml-auto text-xs', muted)}>{formatBytes(entry.sizeBytes)}</span>
      </div>
      <p className="mt-2 text-sm font-medium">{entry.label}</p>
      <p className={clsx('mt-1 truncate font-mono text-xs', muted)} title={entry.path}>
        {entry.fileName}
      </p>
    </div>
  )
}

export function SwitchTitleGroupCard({
  group,
  order,
  onOpenGame,
}: {
  group: SwitchTitleGroup
  order: number
  onOpenGame?: (gameId: string) => void
}) {
  const layout = useThemeLayout()
  const [expanded, setExpanded] = useState(true)
  const total =
    (group.base ? 1 : 0) + group.updates.length + group.dlcs.length + group.extras.length

  const panelClass =
    layout === 'switch'
      ? 'rounded-[1.5rem] border border-[var(--switch-border)] bg-[var(--switch-surface)]'
      : layout === 'ps5'
        ? 'rounded-2xl border border-[var(--ps5-border)] bg-[var(--ps5-panel)]'
        : 'orbit-panel rounded-theme'

  const titleClass =
    layout === 'switch'
      ? 'text-[var(--switch-ink)]'
      : layout === 'ps5'
        ? 'text-[var(--ps5-ink)]'
        : 'text-orbit-foreground'

  const mutedClass =
    layout === 'switch'
      ? 'text-[var(--switch-muted)]'
      : layout === 'ps5'
        ? 'text-[var(--ps5-muted)]'
        : 'text-orbit-muted'

  return (
    <article className={panelClass}>
      <Focusable
        focusId={`switch-group-${group.groupKey}`}
        group="switch-library"
        order={order}
        noScale
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
      >
        {expanded ? (
          <ChevronDown className={clsx('mt-1 h-4 w-4 shrink-0', mutedClass)} />
        ) : (
          <ChevronRight className={clsx('mt-1 h-4 w-4 shrink-0', mutedClass)} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={clsx('text-lg font-semibold', titleClass)}>{group.displayTitle}</h3>
            {group.baseTitleId && (
              <span className={clsx('font-mono text-xs', mutedClass)}>{group.baseTitleId}</span>
            )}
          </div>
          <p className={clsx('mt-1 text-sm', mutedClass)}>
            {group.base ? 'Base installed' : 'Base missing'} · {group.updates.length} update
            {group.updates.length === 1 ? '' : 's'} · {group.dlcs.length} DLC
            {group.dlcs.length === 1 ? '' : 's'}
            {group.extras.length > 0 ? ` · ${group.extras.length} extra` : ''}
          </p>
        </div>
        <span className={clsx('text-xs uppercase tracking-wider', mutedClass)}>
          {total} file{total === 1 ? '' : 's'}
        </span>
      </Focusable>

      {expanded && (
        <div className="space-y-3 border-t border-white/5 px-5 py-4">
          {group.linkedGameId && onOpenGame && (
            <Focusable
              focusId={`switch-open-${group.groupKey}`}
              group={`switch-library-${group.groupKey}`}
              order={0}
              noScale
              onClick={() => onOpenGame(group.linkedGameId!)}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm"
            >
              <Library className="h-4 w-4" />
              Open in library
            </Focusable>
          )}

          {group.base && <RomRow entry={group.base} layout={layout} />}
          {group.updates.map((entry) => (
            <RomRow key={entry.path} entry={entry} layout={layout} />
          ))}
          {group.dlcs.map((entry) => (
            <RomRow key={entry.path} entry={entry} layout={layout} />
          ))}
          {group.extras.map((entry) => (
            <RomRow key={entry.path} entry={entry} layout={layout} />
          ))}

          {!group.base && group.updates.length === 0 && group.dlcs.length === 0 && (
            <p className={clsx('text-sm', mutedClass)}>No recognized content in this group.</p>
          )}
        </div>
      )}
    </article>
  )
}
