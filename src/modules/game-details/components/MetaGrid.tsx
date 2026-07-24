import type { ReactNode } from 'react'
import { Clock3, HardDrive, Trophy } from 'lucide-react'
import { StatCard } from '@/components/data/StatCard'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
} from '@/lib/format'
import type { Game } from '@/types/game'

type MetaGridProps = {
  game: Game
  themed: boolean
}

function MetaCard({
  label,
  value,
  icon,
  themed = false,
}: {
  label: string
  value: string
  icon?: ReactNode
  themed?: boolean
}) {
  return (
    <StatCard
      icon={icon}
      label={label}
      value={value}
      className={
        themed
          ? 'rounded-2xl bg-white/5 p-5 ring-1 ring-white/10'
          : 'orbit-panel rounded-card p-5'
      }
      labelClassName={`gap-2 text-xs uppercase tracking-wider ${
        themed ? 'text-white/55' : 'text-orbit-muted'
      }`}
      valueClassName="mt-2 font-display text-2xl font-medium"
    />
  )
}

export function MetaGrid({ game, themed }: MetaGridProps) {
  const achievements = game.achievements ?? []
  const unlocked = achievements.filter((item) => item.unlocked).length

  return (
    <div className={`mt-10 grid gap-4 md:grid-cols-4 ${themed ? '' : 'px-10'}`}>
      <MetaCard
        themed={themed}
        icon={<Clock3 className="h-4 w-4" />}
        label="Playtime"
        value={formatPlaytime(game.totalPlaytimeSeconds)}
      />
      <MetaCard
        themed={themed}
        icon={<HardDrive className="h-4 w-4" />}
        label="Install size"
        value={formatBytes(game.installSizeBytes)}
      />
      <MetaCard
        themed={themed}
        icon={<Trophy className="h-4 w-4" />}
        label="Achievements"
        value={formatAchievementProgress(unlocked, achievements.length)}
      />
      <MetaCard
        themed={themed}
        label="Added"
        value={formatRelativeDate(game.dateAdded)}
      />
    </div>
  )
}
