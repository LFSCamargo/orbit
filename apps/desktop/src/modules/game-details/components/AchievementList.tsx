import { useState } from 'react'
import { clsx } from 'clsx'
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
      className="details-achievements mt-8 border-t border-white/[0.07] pt-[30px]"
      aria-labelledby="details-achievements-title"
    >
      <header className="details-section-heading mb-[22px] flex items-center justify-between gap-5 max-[520px]:gap-2.5">
        <div>
          <p className="details-eyebrow text-[9px] font-[650] tracking-[0.2em] text-orbit-accent">
            LITTLE VICTORIES
          </p>
          <h2
            id="details-achievements-title"
            className="mt-[7px] text-[21px] font-[550] tracking-[-0.035em] max-[760px]:text-xl min-[1700px]:text-2xl"
          >
            Achievements
          </h2>
        </div>
        {achievements.length > 0 && (
          <span className="details-achievement-count flex items-center gap-2 text-[11px] text-[#f0d4a4] max-[520px]:text-[10px]">
            <Trophy size={16} />
            {unlocked} / {achievements.length}
          </span>
        )}
      </header>
      {!achievements.length ? (
        <div className="details-empty flex flex-col items-center rounded-[18px] border border-dashed border-white/[0.08] px-5 py-8 text-center text-white/[0.33]">
          <Trophy size={24} className="text-orbit-accent opacity-60" />
          <h3 className="mt-3.5 text-[13px] text-white/[0.68]">
            No achievement data yet
          </h3>
          <p className="mt-2 max-w-[340px] text-[11px] leading-[1.8]">
            Orbit hasn’t imported achievements for this game. You can still play and track
            your time.
          </p>
        </div>
      ) : (
        <>
          <progress
            className="details-achievement-progress block h-1 w-full overflow-hidden rounded-full accent-orbit-accent [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-orbit-accent"
            aria-label="Achievement completion"
            value={unlocked}
            max={achievements.length}
          />
          <div
            className="details-achievement-filters mb-4 mt-5 flex gap-2"
            role="group"
            aria-label="Show achievements"
          >
            {(['all', 'unlocked'] as const).map((item, index) => (
              <Focusable
                key={item}
                focusId={`details-achievements-${item}`}
                className={clsx(
                  'orbit-glass-control rounded-full border border-transparent px-[13px] py-2 text-[10px] text-white/50',
                  'aria-pressed:border-white/[0.09] aria-pressed:bg-white/[0.05] aria-pressed:text-white/85',
                )}
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
            <p className="details-empty-filter py-[15px] text-xs text-white/[0.44]">
              Your first unlock is still ahead of you.
            </p>
          )}
          <div className="details-achievement-grid grid grid-cols-2 gap-3 max-[760px]:gap-2.5 max-[520px]:grid-cols-1">
            {visible.slice(0, limit).map((item) => (
              <article
                key={item.id}
                className="details-achievement orbit-glass-control flex items-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.01] px-4 py-[18px]"
                data-unlocked={item.unlocked}
              >
                <span
                  className={clsx(
                    'details-achievement-icon orbit-glass-control grid size-9 shrink-0 place-items-center rounded-[11px]',
                    item.unlocked
                      ? 'bg-[#e6c48b0d] text-[#e6c48b]'
                      : 'bg-white/[0.02] text-white/25',
                  )}
                >
                  {item.unlocked ? <Trophy size={19} /> : <LockKeyhole size={19} />}
                </span>
                <div>
                  <h3 className="text-xs font-medium leading-normal text-white/[0.83]">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="mt-[5px] text-[10px] leading-[1.7] text-white/40">
                      {item.description}
                    </p>
                  )}
                  <span
                    className={clsx(
                      'details-achievement-state mt-[9px] flex items-center gap-1 text-[8px]',
                      item.unlocked ? 'text-[#e6c48b99]' : 'text-white/[0.33]',
                    )}
                  >
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
              className="details-show-more mt-5 rounded-full border border-white/[0.125] px-[18px] py-2.5 text-[11px] text-white/[0.65]"
            >
              Show more · {visible.length - limit} remaining
            </Focusable>
          )}
        </>
      )}
    </section>
  )
}
