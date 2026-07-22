import { clsx } from 'clsx'
import type { GameProvider } from '@/types/game'
import { providerLabel } from '@/lib/format'

const COLORS: Record<GameProvider, string> = {
  astris: 'bg-rose-500/20 text-rose-200 ring-rose-400/30',
  steam: 'bg-sky-500/20 text-sky-200 ring-sky-400/30',
  gamehub: 'bg-amber-500/20 text-amber-100 ring-amber-400/30',
  native: 'bg-emerald-500/20 text-emerald-100 ring-emerald-400/30',
  manual: 'bg-violet-500/20 text-violet-100 ring-violet-400/30',
}

export function ProviderBadge({
  provider,
  className,
}: {
  provider: GameProvider
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] ring-1',
        COLORS[provider],
        className,
      )}
    >
      {providerLabel(provider)}
    </span>
  )
}
