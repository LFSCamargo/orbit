import { useState } from 'react'
import { Trophy, LockKeyhole, Check } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { Achievement } from '@/types/game'

export function AchievementList({ achievements }: { achievements: Achievement[] }) {
  const [filter, setFilter] = useState<'all' | 'unlocked'>('all')
  const [limit, setLimit] = useState(6)
  const unlocked = achievements.filter((item) => item.unlocked).length
  const visible = achievements.filter((item) => filter === 'all' || item.unlocked)
  return (
    <section
      className="details-achievements"
      aria-labelledby="details-achievements-title"
    >
      <header className="details-section-heading">
        <div>
          <p className="details-eyebrow">LITTLE VICTORIES</p>
          <h2 id="details-achievements-title">Achievements</h2>
        </div>
        {achievements.length > 0 && (
          <span className="details-achievement-count">
            <Trophy size={16} />
            {unlocked} / {achievements.length}
          </span>
        )}
      </header>
      {!achievements.length ? (
        <div className="details-empty">
          <Trophy size={24} />
          <h3>No achievement data yet</h3>
          <p>
            Orbit hasn’t imported achievements for this game. You can still play and track
            your time.
          </p>
        </div>
      ) : (
        <>
          <progress
            className="details-achievement-progress"
            aria-label="Achievement completion"
            value={unlocked}
            max={achievements.length}
          />
          <div
            className="details-achievement-filters"
            role="group"
            aria-label="Show achievements"
          >
            {(['all', 'unlocked'] as const).map((item, index) => (
              <Focusable
                key={item}
                focusId={`details-achievements-${item}`}
                className="orbit-glass-control"
                group="details-achievements"
                order={index}
                noScale
                aria-pressed={filter === item}
                onClick={() => {
                  setFilter(item)
                  setLimit(6)
                }}
              >
                {item === 'all' ? 'All achievements' : `Unlocked (${unlocked})`}
              </Focusable>
            ))}
          </div>
          {!visible.length && (
            <p className="details-empty-filter">
              Your first unlock is still ahead of you.
            </p>
          )}
          <div className="details-achievement-grid">
            {visible.slice(0, limit).map((item) => (
              <article
                key={item.id}
                className="details-achievement orbit-glass-control"
                data-unlocked={item.unlocked}
              >
                <span className="details-achievement-icon orbit-glass-control">
                  {item.unlocked ? <Trophy size={19} /> : <LockKeyhole size={19} />}
                </span>
                <div>
                  <h3>{item.name}</h3>
                  {item.description && <p>{item.description}</p>}
                  <span className="details-achievement-state">
                    {item.unlocked ? (
                      <>
                        <Check size={11} />
                        Unlocked
                      </>
                    ) : (
                      'Locked'
                    )}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {visible.length > limit && (
            <Focusable
              focusId="details-achievements-more"
              group="details-achievements"
              order={2}
              noScale
              onClick={() => setLimit(limit + 6)}
              className="details-show-more"
            >
              Show more · {visible.length - limit} remaining
            </Focusable>
          )}
        </>
      )}
    </section>
  )
}
