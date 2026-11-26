import { describe, expect, it, vi } from 'vitest'
import {
  guardedStore,
  isReaction,
  memoryStore,
  normalizeStats,
  readStats,
  recordView,
  setReaction,
} from '../stats'

describe('blog stats', () => {
  it('counts views and reactions, never below zero', async () => {
    const store = memoryStore()
    await recordView('post', store)
    await recordView('post', store)
    await setReaction('post', 'like', true, store)
    await setReaction('post', 'love', false, store)
    const stats = await readStats('post', store)
    expect(stats.views).toBe(2)
    expect(stats.reactions).toEqual({ like: 1, love: 0, rocket: 0, game: 0 })
  })

  it('does not lose concurrent updates to one post', async () => {
    const store = memoryStore()
    await Promise.all(Array.from({ length: 20 }, () => recordView('busy', store)))
    expect((await readStats('busy', store)).views).toBe(20)
  })

  it('treats malformed stored values as zero', () => {
    expect(normalizeStats({ views: -4, reactions: { like: 'x', rocket: 2.7 } })).toEqual({
      views: 0,
      reactions: { like: 0, love: 0, rocket: 2, game: 0 },
    })
    expect(normalizeStats(null).views).toBe(0)
  })

  it('only accepts known reactions', () => {
    expect(isReaction('rocket')).toBe(true)
    expect(isReaction('__proto__')).toBe(false)
  })

  it('gives up on a storage call that never settles', async () => {
    // Regression: on Netlify every Blobs call hung until the function was killed.
    const hanging = guardedStore(
      { read: () => new Promise(() => {}), write: () => new Promise(() => {}) },
      20,
    )
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await readStats('post', hanging)).views).toBe(0)
    await expect(recordView('post', hanging)).rejects.toThrow('timed out')
    errors.mockRestore()
  })

  it('never writes zeros over the counts when a read fails', async () => {
    const writes: unknown[] = []
    const failing = {
      read: () => Promise.reject(new Error('offline')),
      write: async (_slug: string, stats: unknown) => {
        writes.push(stats)
      },
    }
    await expect(setReaction('post', 'like', true, failing)).rejects.toThrow('offline')
    expect(writes).toEqual([])
  })
})
