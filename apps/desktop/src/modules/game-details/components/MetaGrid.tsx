import { Clock3, Cloud, HardDrive, Trophy, History } from 'lucide-react'
import { clsx } from 'clsx'
import { StatCard } from '@/components/data/StatCard'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import {
  formatAchievementProgress,
  formatBytes,
  formatPlaytime,
  formatRelativeDate,
} from '@/lib/format'
import type { Game } from '@/types/game'

export function MetaGrid({
  game,
  sizes,
}: {
  game: Game
  sizes?: { diskBytes: number | null; downloadBytes: number | null; measuring?: boolean }
}) {
  const diskBytes = sizes ? sizes.diskBytes : (game.installSizeBytes ?? null)
  const achievements = game.achievements ?? []
  // Streamed games have no files on this Mac and no tracked playtime.
  const cloud = game.provider === 'xcloud'
  const stats = [
    {
      label: 'Time played',
      value: cloud ? 'Not tracked' : formatPlaytime(game.totalPlaytimeSeconds),
      icon: Clock3,
    },
    {
      label: 'Last played',
      value: game.lastPlayedAt ? formatRelativeDate(game.lastPlayedAt) : 'Not yet played',
      icon: History,
    },
    cloud
      ? { label: 'Plays in', value: 'Your browser', detail: undefined, icon: Cloud }
      : {
          label: 'Disk usage',
          value: diskBytes ? formatBytes(diskBytes) : 'Not available',
          detail: sizes?.measuring
            ? 'Measuring…'
            : sizes?.downloadBytes
              ? `${formatBytes(sizes.downloadBytes)} download`
              : undefined,
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
  const content = stats.map(({ label, value, detail, icon: Icon }) => (
    <StatCard
      key={label}
      icon={<Icon size={15} />}
      label={label}
      value={value}
      detail={detail}
      detailClassName="mt-1 text-[11px] text-white/[0.45]"
      className={clsx(
        'details-stat relative px-[26px] py-[25px]',
        "before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-px before:bg-white/[0.07] before:content-[''] first:before:hidden",
        'max-[760px]:[&:nth-child(3)]:before:hidden max-[760px]:[&:nth-child(n+3)]:border-t max-[760px]:[&:nth-child(n+3)]:border-white/10',
        'min-[1700px]:p-[30px]',
        'min-[521px]:max-[1000px]:px-[18px] min-[521px]:max-[1000px]:py-[22px]',
        'max-[520px]:px-4 max-[520px]:py-5',
      )}
      labelClassName="details-stat-label gap-2 text-[10px] text-white/[0.45] max-[520px]:text-[9px] [&_svg]:text-orbit-accent [&_svg]:opacity-[0.85]"
      valueClassName="details-stat-value mt-[11px] text-[clamp(16px,1.6vw,23px)] font-[550] tracking-[-0.025em] max-[520px]:text-[18px]"
    />
  ))
  return (
    <LiquidGlass
      className="details-stats grid grid-cols-4 border-white/[0.15] max-[760px]:grid-cols-2"
      radius={24}
    >
      {content}
    </LiquidGlass>
  )
}
