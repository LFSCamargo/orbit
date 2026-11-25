import { HardDrive } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import type { StorageDrive, StorageKind, StorageOverview } from '@/types/storage'
import {
  CATEGORIES,
  categoryShares,
  diskUsedPercent,
  driveCategoryBytes,
  driveOtherAppsBytes,
  onVolumeBytes,
  volumeUsedPercent,
} from './storageModel'
import { KICKER, STORAGE_CARD } from './styles'

function UsageBar({
  totalBytes,
  byKind,
  otherApps,
  label,
  heightClass = 'h-3',
}: {
  totalBytes: number
  byKind: Record<StorageKind, number>
  otherApps: number
  label: string
  heightClass?: string
}) {
  const width = (bytes: number) =>
    totalBytes > 0 ? `${Math.min(100, (bytes / totalBytes) * 100)}%` : '0%'
  return (
    <div
      className={`flex ${heightClass} w-full overflow-hidden rounded-full bg-white/10`}
      role="img"
      aria-label={label}
    >
      {CATEGORIES.map((category) => (
        <span
          key={category.kind}
          className="h-full first:rounded-l-full"
          style={{ width: width(byKind[category.kind]), background: category.color }}
        />
      ))}
      <span className="h-full bg-white/25" style={{ width: width(otherApps) }} />
    </div>
  )
}

function DriveStatusRow({ drive }: { drive: StorageDrive }) {
  const byKind = driveCategoryBytes(drive)
  const otherApps = driveOtherAppsBytes(drive)
  const used = volumeUsedPercent(drive.totalBytes, drive.freeBytes)
  const ariaLabel = `${drive.name}: ${formatBytes(drive.orbitBytes)} used by Orbit, ${formatBytes(drive.freeBytes)} free of ${formatBytes(drive.totalBytes)}`
  return (
    <li className="grid gap-1.5" data-testid="storage-drive-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1.5 font-semibold">
          <HardDrive size={13} className="text-orbit-muted" aria-hidden />
          <span>{drive.name}</span>
          {drive.orbitBytes > 0 && (
            <span className="font-normal text-orbit-muted">
              · {formatBytes(drive.orbitBytes)} by Orbit
            </span>
          )}
        </span>
        <span className="tabular-nums text-orbit-muted">
          {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
          {used !== null ? (
            <strong className="ml-2 font-semibold text-white">{used}%</strong>
          ) : null}
        </span>
      </div>
      <UsageBar
        totalBytes={drive.totalBytes}
        byKind={byKind}
        otherApps={otherApps}
        label={ariaLabel}
        heightClass="h-2"
      />
    </li>
  )
}

/** Orbit's footprint across all connected drives, plus a dedicated status bar per drive. */
export function StorageOverviewCard({ overview }: { overview: StorageOverview }) {
  const shares = categoryShares(overview)
  const drives = overview.drives ?? []
  const used = diskUsedPercent(overview)
  const volume = overview.volumeTotalBytes

  const byKind: Record<StorageKind, number> =
    drives.length > 0
      ? drives.reduce<Record<StorageKind, number>>(
          (acc, drive) => ({
            game: acc.game + drive.totals.games,
            tool: acc.tool + drive.totals.tools,
            runtime: acc.runtime + drive.totals.runtimes,
            other: acc.other + drive.totals.other,
          }),
          { game: 0, tool: 0, runtime: 0, other: 0 },
        )
      : onVolumeBytes(overview.items)
  const orbitOnVolumes = byKind.game + byKind.tool + byKind.runtime + byKind.other
  const otherApps = Math.max(0, volume - overview.volumeFreeBytes - orbitOnVolumes)

  return (
    <section className={STORAGE_CARD} aria-label="Storage overview">
      <div className="flex items-center justify-between gap-2">
        <p className={KICKER}>
          STORAGE OVERVIEW
          {drives.length > 1 ? ` · ${drives.length} DRIVES` : ''}
        </p>
      </div>
      <div className="flex items-end justify-between gap-4">
        <p className="m-0">
          <strong className="text-[clamp(24px,2.4vw,32px)] font-semibold tracking-[-0.03em]">
            {formatBytes(overview.orbitBytes)}
          </strong>
          <span className="ml-2 text-[13px] text-orbit-muted">
            used by Orbit
            {volume > 0
              ? ` · ${formatBytes(overview.volumeFreeBytes)} free of ${formatBytes(volume)}`
              : ''}
          </span>
        </p>
        {used !== null && (
          <span className="text-[15px] font-semibold tabular-nums" title="Disk in use">
            {used}%
          </span>
        )}
      </div>
      <UsageBar
        totalBytes={volume}
        byKind={byKind}
        otherApps={otherApps}
        label={shares
          .map((share) => `${share.plural} ${formatBytes(share.bytes)}`)
          .join(', ')}
      />
      <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-[12px]">
        {shares.map((share) => (
          <li key={share.kind} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: share.color }} />
            <span>{share.plural}</span>
            <span className="text-orbit-muted">{formatBytes(share.bytes)}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/25" />
          <span>Other apps</span>
          <span className="text-orbit-muted">{formatBytes(otherApps)}</span>
        </li>
      </ul>
      {drives.length > 1 && (
        <div className="grid gap-3 border-t border-white/10 pt-3.5">
          <p className={KICKER}>CONNECTED DRIVES</p>
          <ul className="m-0 grid list-none gap-3 p-0" aria-label="Connected drives">
            {drives.map((drive) => (
              <DriveStatusRow key={drive.id} drive={drive} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
