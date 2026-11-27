import { formatTransferRate } from '@/lib/downloadProgress'
import { sparklinePoints } from './NetworkCard'

/** Polygon under the speed line, for the filled area. O(n). */
function areaPoints(line: string): string {
  if (!line) return ''
  const points = line.split(' ')
  const first = points[0].split(',')[0]
  const last = points[points.length - 1].split(',')[0]
  return `${first},44 ${line} ${last},44`
}

/**
 * This download's speed over the last minute or so, as Steam draws it: a
 * filled line scaled to the fastest moment, with the peak beside it.
 */
export function DownloadSpeedGraph({
  samples,
  peak,
}: {
  samples: number[]
  peak: number
}) {
  const line = sparklinePoints(samples)
  if (!line) return null
  return (
    <div className="flex items-end gap-2" data-testid="download-speed-graph">
      <svg
        viewBox="0 0 220 44"
        preserveAspectRatio="none"
        className="h-7 min-w-0 flex-1 text-orbit-accent"
        role="img"
        aria-label={`Download speed over time, peak ${formatTransferRate(peak)}`}
      >
        <polygon points={areaPoints(line)} fill="currentColor" opacity="0.16" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="shrink-0 text-[10px] tabular-nums leading-none text-white/45">
        Peak {formatTransferRate(peak)}
      </span>
    </div>
  )
}
