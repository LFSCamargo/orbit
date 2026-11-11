import { Clock3, HardDrive, Trophy, History } from 'lucide-react'
import { StatCard } from '@/components/data/StatCard'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
} from '@/lib/format'
import type { Game } from '@/types/game'

export function MetaGrid({ game }: { game: Game }) {
  const achievements = game.achievements ?? []
  const stats = [
    {
      label: 'Time played',
      value: formatPlaytime(game.totalPlaytimeSeconds),
      icon: Clock3,
    },
    {
      label: 'Last played',
      value: game.lastPlayedAt ? formatRelativeDate(game.lastPlayedAt) : 'Not yet played',
      icon: History,
    },
    {
      label: 'Install size',
      value: game.installSizeBytes ? formatBytes(game.installSizeBytes) : 'Not available',
      icon: HardDrive,
    },
    {
      label: 'Achievements',
      value: formatAchievementProgress(
        achievements.filter((item) => item.unlocked).length,
        achievements.length,
      ),
      icon: Trophy,
    },
  ]
  const content = stats.map(({ label, value, icon: Icon }) => (
    <StatCard
      key={label}
      icon={<Icon size={15} />}
      label={label}
      value={value}
      className="details-stat"
      labelClassName="details-stat-label"
      valueClassName="details-stat-value"
    />
  ))
  return (
    <LiquidGlass className="details-stats" radius={24}>
      {content}
    </LiquidGlass>
  )
}
