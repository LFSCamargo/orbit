import { ArrowDown, ArrowUp, Wifi } from 'lucide-react'
import { formatTransferRate } from '@/lib/downloadProgress'
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

/** Live download rate. SteamCMD reports no upload, so upload reads as a dash. */
export function NetworkCard({
  connected,
  rate,
  samples,
}: {
  connected: boolean
  rate: number | null
  samples: number[]
}) {
  const points = sparklinePoints(samples)
  return (
    <section className={CARD} aria-label="Network">
      <h3 className={SECTION_TITLE}>Network</h3>
      {points ? (
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
            {connected ? formatTransferRate(rate ?? 0) : '—'}
          </strong>
          <span className="text-[11px] text-white/55">Download</span>
        </div>
        <div className="grid gap-0.5">
          <strong className="inline-flex items-center justify-center gap-1 text-[15px] font-[650] tabular-nums">
            <ArrowUp size={14} aria-hidden />—
          </strong>
          <span className="text-[11px] text-white/55">Upload</span>
        </div>
      </div>
    </section>
  )
}
