import { formatBytes } from '@/lib/format'
import type { StorageOverview } from '@/types/storage'
import { categoryShares, diskUsedPercent, onVolumeBytes } from './storageModel'
import { KICKER, STORAGE_CARD } from './styles'

/** Orbit's footprint on the disk, split by category, beside the rest of the volume. */
export function StorageOverviewCard({ overview }: { overview: StorageOverview }) {
  const shares = categoryShares(overview)
  const used = diskUsedPercent(overview)
  const volume = overview.volumeTotalBytes
  // Games on another drive count in the totals but not in this drive's bar.
  const onDrive = onVolumeBytes(overview.items)
  const orbitOnDrive = onDrive.game + onDrive.tool + onDrive.runtime + onDrive.other
  const otherApps = Math.max(0, volume - overview.volumeFreeBytes - orbitOnDrive)
  const width = (bytes: number) => (volume > 0 ? `${(bytes / volume) * 100}%` : '0%')
  return (
    <section className={STORAGE_CARD} aria-label="Storage overview">
      <p className={KICKER}>STORAGE OVERVIEW</p>
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
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={shares
          .map((share) => `${share.plural} ${formatBytes(share.bytes)}`)
          .join(', ')}
      >
        {shares.map((share) => (
          <span
            key={share.kind}
            className="h-full first:rounded-l-full"
            style={{ width: width(onDrive[share.kind]), background: share.color }}
          />
        ))}
        <span className="h-full bg-white/25" style={{ width: width(otherApps) }} />
      </div>
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
    </section>
  )
}
