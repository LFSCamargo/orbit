import { Trophy } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Achievement } from '@/types/game'

type AchievementListProps = {
  achievements: Achievement[]
  themed: boolean
}

export function AchievementList({ achievements, themed }: AchievementListProps) {
  if (achievements.length === 0) return null

  return (
    <div className={`mt-10 ${themed ? '' : 'px-10'}`}>
      <h2 className="font-display text-2xl font-semibold">Achievements</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {achievements.map((achievement, index) => (
          <motion.div
            key={achievement.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.3 }}
            className={`orbit-panel rounded-card p-4 ${
              achievement.unlocked ? 'opacity-100' : 'opacity-55'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{achievement.name}</p>
                {achievement.description && (
                  <p className="mt-1 text-sm text-orbit-muted">{achievement.description}</p>
                )}
              </div>
              <Trophy
                className={`h-4 w-4 shrink-0 ${
                  achievement.unlocked ? 'text-amber-300' : 'text-orbit-muted'
                }`}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
