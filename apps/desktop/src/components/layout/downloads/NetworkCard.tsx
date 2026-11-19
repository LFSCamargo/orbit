import { ArrowDown, ArrowUp, Wifi, WifiOff } from 'lucide-react'
import { formatTransferRate } from '@/lib/downloadProgress'
import type { NetworkStats } from '@/types/downloads'
import { CARD, SECTION_TITLE } from './styles'

const WIDTH = 220
const HEIGHT = 44

/** Polyline points for recent rates, scaled to the busiest sample. O(n). */
export function sparklinePoints(samples: number[]): string {
  if (samples.length < 2) return ''
  const peak = Math.max(...samples, 1)
  const step = WIDTH / (samples.length - 1)
  return samples
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10
      const y = Math.round((HEIGHT - 4 - (value / peak) * (HEIGHT - 8)) * 10) / 10
      return `${x},${y}`
    })
    .join(' ')
}

/** The Mac's live download and upload speed, with whether it is online. */
export function NetworkCard({
  stats,
  samples,
}: {
  stats: NetworkStats | null
  samples: number[]
}) {
  const points = sparklinePoints(samples)
  const offline = stats?.online === false
  const rate = (value: number | undefined) =>
    stats && !offline && value !== undefined ? formatTransferRate(value) : '—'
  return (
    <section className={CARD} aria-label="Network">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={SECTION_TITLE}>Network</h3>
          <p className="m-0 mt-0.5 text-[12px] leading-snug text-white/55">
            Live speed of this Mac’s connection.
          </p>
        </div>
        {stats && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-[600] ${
              offline
                ? 'bg-[#ff6b6b]/15 text-[#ffb4b4]'
                : 'bg-[#4ade80]/15 text-[#86efac]'
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${offline ? 'bg-[#ff6b6b]' : 'bg-[#4ade80]'}`}
            />
            {offline ? 'Offline' : 'Online'}
          </span>
        )}
      </div>
      {offline ? (
        <p
          role="status"
          className="m-0 flex items-center gap-2 text-[12px] leading-snug text-white/70"
        >
          <WifiOff size={16} className="shrink-0 text-[#ffb4b4]" aria-hidden />
          Downloads are paused and resume on their own when this Mac is back online.
        </p>
      ) : points ? (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-11 w-full text-orbit-accent"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <Wifi size={18} className="text-white/55" aria-hidden />
      )}
      <div className="grid grid-cols-2 divide-x divide-white/10 text-center">
        <div className="grid gap-0.5">
          <strong className="inline-flex items-center justify-center gap-1 text-[15px] font-[650] tabular-nums">
            <ArrowDown size={14} aria-hidden />
            {rate(stats?.downloadRate)}
          </strong>
          <span className="text-[11px] text-white/55">Download</span>
        </div>
        <div className="grid gap-0.5">
          <strong className="inline-flex items-center justify-center gap-1 text-[15px] font-[650] tabular-nums">
            <ArrowUp size={14} aria-hidden />
            {rate(stats?.uploadRate)}
          </strong>
          <span className="text-[11px] text-white/55">Upload</span>
        </div>
      </div>
    </section>
  )
}
