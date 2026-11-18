import { Boxes, Gamepad2, Layers, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatBytes } from '@/lib/format'
import type { StorageKind, StorageOverview } from '@/types/storage'
import { categoryShares } from './storageModel'
import { KICKER, STORAGE_CARD } from './styles'

const ICONS: Record<StorageKind, LucideIcon> = {
  game: Gamepad2,
  tool: Wrench,
  runtime: Layers,
  other: Boxes,
}

export function StorageDistribution({ overview }: { overview: StorageOverview }) {
  return (
    <section className={STORAGE_CARD} aria-label="Distribution">
      <p className={KICKER}>DISTRIBUTION</p>
      <ul className="m-0 grid list-none gap-3.5 p-0">
        {categoryShares(overview).map((share) => {
          const Icon = ICONS[share.kind]
          return (
            <li
              key={share.kind}
              className="grid grid-cols-[18px_1fr] items-center gap-x-3 gap-y-1.5"
            >
              <Icon size={15} style={{ color: share.color }} aria-hidden />
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="font-semibold">{share.plural}</span>
                <span className="tabular-nums text-orbit-muted">
                  {formatBytes(share.bytes)} · {share.percent.toFixed(1)}%
                </span>
              </div>
              <span
                className="col-start-2 h-1.5 overflow-hidden rounded-full bg-white/10"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${share.percent}%`, background: share.color }}
                />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
