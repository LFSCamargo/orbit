/** View and reaction counts for blog posts. On Netlify they live in a Netlify
 * Blobs store; anywhere else (local dev, tests) in memory. Counts are
 * anonymous: no account, IP or fingerprint is stored. */

export const REACTIONS = ['like', 'love', 'rocket', 'game'] as const
export type Reaction = (typeof REACTIONS)[number]

export interface PostStats {
  views: number
  reactions: Record<Reaction, number>
}

function emptyStats(): PostStats {
  return { views: 0, reactions: { like: 0, love: 0, rocket: 0, game: 0 } }
}

export function isReaction(value: unknown): value is Reaction {
  return typeof value === 'string' && (REACTIONS as readonly string[]).includes(value)
}

/** A stored value of any shape, made safe to count with. */
export function normalizeStats(value: unknown): PostStats {
  const stats = emptyStats()
  if (!value || typeof value !== 'object') return stats
  const raw = value as { views?: unknown; reactions?: Record<string, unknown> }
  const count = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  stats.views = count(raw.views)
  for (const reaction of REACTIONS)
    stats.reactions[reaction] = count(raw.reactions?.[reaction])
  return stats
}

export interface StatsStore {
  read(slug: string): Promise<unknown>
  write(slug: string, stats: PostStats): Promise<void>
}

export function memoryStore(): StatsStore {
  const values = new Map<string, PostStats>()
  return {
    read: async (slug) => values.get(slug),
    write: async (slug, stats) => {
      values.set(slug, stats)
    },
  }
}

async function netlifyStore(): Promise<StatsStore | null> {
  try {
    const { getStore } = await import('@netlify/blobs')
    const store = getStore({ name: 'orbit-blog-stats', consistency: 'strong' })
    return {
      read: (slug) => store.get(`post/${slug}`, { type: 'json' }),
      write: async (slug, stats) => {
        await store.setJSON(`post/${slug}`, stats)
      },
    }
  } catch {
    // Not running on Netlify: no Blobs environment.
    return null
  }
}

const globalStats = globalThis as typeof globalThis & {
  orbitStatsStore?: Promise<StatsStore>
}

function defaultStore(): Promise<StatsStore> {
  globalStats.orbitStatsStore ??= netlifyStore().then((store) => store ?? memoryStore())
  return globalStats.orbitStatsStore
}

/** Updates to one post run one after another within an instance, so two
 * quick reactions are not lost to a read-modify-write race. */
const queues = new Map<string, Promise<unknown>>()

function serialize<T>(slug: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(slug) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(task)
  queues.set(slug, next)
  return next
}

export async function readStats(slug: string, store?: StatsStore): Promise<PostStats> {
  const target = store ?? (await defaultStore())
  try {
    return normalizeStats(await target.read(slug))
  } catch {
    return emptyStats()
  }
}

type Update = (stats: PostStats) => void

function updateStats(
  slug: string,
  update: Update,
  store?: StatsStore,
): Promise<PostStats> {
  return serialize(slug, async () => {
    const target = store ?? (await defaultStore())
    const stats = await readStats(slug, target)
    update(stats)
    await target.write(slug, stats)
    return stats
  })
}

export function recordView(slug: string, store?: StatsStore): Promise<PostStats> {
  return updateStats(
    slug,
    (stats) => {
      stats.views += 1
    },
    store,
  )
}

export function setReaction(
  slug: string,
  reaction: Reaction,
  active: boolean,
  store?: StatsStore,
): Promise<PostStats> {
  return updateStats(
    slug,
    (stats) => {
      stats.reactions[reaction] = Math.max(
        0,
        stats.reactions[reaction] + (active ? 1 : -1),
      )
    },
    store,
  )
}
