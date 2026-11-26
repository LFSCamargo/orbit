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

/** Longest a storage call may take before the request gives up on it. */
const STORE_TIMEOUT_MS = 4000

/** Rejects when `promise` has not settled within `ms`, so a stuck storage call
 * can never hold a request open until the platform kills it. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Every call is time-limited and failures are logged (Netlify function logs). */
export function guardedStore(store: StatsStore, ms = STORE_TIMEOUT_MS): StatsStore {
  const guard = <T>(promise: Promise<T>, label: string) =>
    withTimeout(promise, ms, label).catch((error: unknown) => {
      console.error(`Blog stats: ${label} failed:`, error)
      throw error
    })
  return {
    read: (slug) => guard(store.read(slug), `read ${slug}`),
    write: (slug, stats) => guard(store.write(slug, stats), `write ${slug}`),
  }
}

async function netlifyStore(): Promise<StatsStore | null> {
  try {
    const { getStore } = await import('@netlify/blobs')
    // Default (eventual) consistency: strong consistency needs an extra edge
    // endpoint, and on the deployed site its calls never settled.
    const store = getStore('orbit-blog-stats')
    return guardedStore({
      read: (slug) => store.get(`post/${slug}`, { type: 'json' }),
      write: async (slug, stats) => {
        await store.setJSON(`post/${slug}`, stats)
      },
    })
  } catch (error) {
    // Not running on Netlify: no Blobs environment.
    if (process.env.NETLIFY)
      console.error('Blog stats: Netlify Blobs is unavailable:', error)
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

/** Current counts, or zero counts when storage cannot be read. */
export async function readStats(slug: string, store?: StatsStore): Promise<PostStats> {
  try {
    const target = store ?? (await defaultStore())
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
    // A failed read must not be written back as zeros: let the caller fail.
    const stats = normalizeStats(await target.read(slug))
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
