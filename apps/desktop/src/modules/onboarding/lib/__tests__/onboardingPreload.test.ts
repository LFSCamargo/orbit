import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { preloadOnboarding } from '../onboardingPreload'

afterEach(() => vi.useRealTimers())

const queries = (fn: () => Promise<unknown>) => ({
  catalog: { queryKey: ['c'], queryFn: fn },
  installed: { queryKey: ['i'], queryFn: fn },
  orbitWine: { queryKey: ['o'], queryFn: fn },
})

it('fetches what Setup shows and loads the scene before onboarding appears', async () => {
  const client = new QueryClient()
  const fetched = vi.fn().mockResolvedValue('data')
  const scene = vi.fn().mockResolvedValue({})
  await preloadOnboarding(client, {
    queries: queries(fetched),
    modules: [scene],
    images: [],
  })
  expect(fetched).toHaveBeenCalledTimes(3)
  expect(scene).toHaveBeenCalledTimes(1)
  expect(client.getQueryData(['o'])).toBe('data')
})

it('still lets onboarding appear when something fails or hangs', async () => {
  vi.useFakeTimers()
  const client = new QueryClient()
  const done = vi.fn()
  void preloadOnboarding(client, {
    queries: queries(() => new Promise(() => {})),
    modules: [() => Promise.reject(new Error('offline'))],
    images: ['missing.webp'],
    timeoutMs: 3000,
  }).then(done)
  await vi.advanceTimersByTimeAsync(2900)
  expect(done).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(200)
  expect(done).toHaveBeenCalled()
})
