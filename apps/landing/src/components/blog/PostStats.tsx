'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { EyeIcon } from '@/components/ui/icons'
import { REACTIONS, type PostStats, type Reaction } from '@/lib/blog/stats'
import { cn } from '@/lib/utils'

interface PostStatsValue {
  stats: PostStats | null
  mine: Reaction[]
  toggle: (reaction: Reaction) => void
}

const PostStatsContext = createContext<PostStatsValue | null>(null)

type Payload = { stats: PostStats; mine: Reaction[] }

async function post(
  slug: string,
  body: Record<string, unknown>,
): Promise<Payload | null> {
  try {
    const response = await fetch(`/api/blog/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return response.ok ? ((await response.json()) as Payload) : null
  } catch {
    return null
  }
}

/** Counts this read once, then shares the post's views and reactions with
 * the header badge and the reaction bar. */
export function PostStatsProvider({
  slug,
  children,
}: {
  slug: string
  children: ReactNode
}) {
  const [stats, setStats] = useState<PostStats | null>(null)
  const [mine, setMine] = useState<Reaction[]>([])

  useEffect(() => {
    let active = true
    post(slug, { action: 'view' }).then((payload) => {
      if (!active || !payload) return
      setStats(payload.stats)
      setMine(payload.mine)
    })
    return () => {
      active = false
    }
  }, [slug])

  const toggle = useCallback(
    (reaction: Reaction) => {
      const active = !mine.includes(reaction)
      // Optimistic: the server answers with the real totals.
      setMine((current) =>
        active ? [...current, reaction] : current.filter((item) => item !== reaction),
      )
      setStats((current) =>
        current
          ? {
              ...current,
              reactions: {
                ...current.reactions,
                [reaction]: Math.max(0, current.reactions[reaction] + (active ? 1 : -1)),
              },
            }
          : current,
      )
      post(slug, { action: 'react', reaction, active }).then((payload) => {
        if (!payload) return
        setStats(payload.stats)
        setMine(payload.mine)
      })
    },
    [mine, slug],
  )

  const value = useMemo(() => ({ stats, mine, toggle }), [stats, mine, toggle])
  return <PostStatsContext.Provider value={value}>{children}</PostStatsContext.Provider>
}

function usePostStats(): PostStatsValue {
  const value = useContext(PostStatsContext)
  if (!value) throw new Error('PostStatsProvider is missing')
  return value
}

const numberFormat = new Intl.NumberFormat('en-US', { notation: 'compact' })

export function formatCount(count: number): string {
  return numberFormat.format(count)
}

export function PostViewCount({ className }: { className?: string }) {
  const { stats } = usePostStats()
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <EyeIcon className="h-4 w-4" />
      <span aria-live="polite">
        {stats
          ? `${formatCount(stats.views)} ${stats.views === 1 ? 'view' : 'views'}`
          : '— views'}
      </span>
    </span>
  )
}

const REACTION_DETAILS: Record<Reaction, { emoji: string; label: string }> = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  rocket: { emoji: '🚀', label: 'Hyped' },
  game: { emoji: '🎮', label: 'Want to play' },
}

export function PostReactions() {
  const { stats, mine, toggle } = usePostStats()
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-muted">
        What did you think?
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="Reactions">
        {REACTIONS.map((reaction) => {
          const pressed = mine.includes(reaction)
          const { emoji, label } = REACTION_DETAILS[reaction]
          const count = stats?.reactions[reaction] ?? 0
          return (
            <li key={reaction}>
              <button
                type="button"
                aria-pressed={pressed}
                aria-label={`${label} (${count})`}
                onClick={() => toggle(reaction)}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orbit-focus active:scale-95',
                  pressed
                    ? 'border-orange-400/70 bg-orange-500/15 text-white shadow-[0_0_24px_-6px_rgb(255_120_40/0.8)]'
                    : 'border-white/[0.12] bg-white/[0.04] text-white/80 hover:border-white/25',
                )}
              >
                <span aria-hidden="true" className="text-base">
                  {emoji}
                </span>
                <span className="tabular-nums">{formatCount(count)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
