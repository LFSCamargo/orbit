import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { holdSplash, resetSplashForTests, SPLASH_MIN_MS, splashActive } from '../splash'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="orbit-splash"></div><div id="root"></div>'
  document.documentElement.classList.add('orbit-booting')
  resetSplashForTests()
})
afterEach(() => vi.useRealTimers())

const splash = () => document.getElementById('orbit-splash')
const flush = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms)
}

it('stays up while anything holds it, then zooms into Orbit', async () => {
  const boot = holdSplash()
  const home = holdSplash()
  boot()
  await flush(SPLASH_MIN_MS + 100)
  expect(splash()?.classList.contains('orbit-splash--leaving')).toBe(false)
  home()
  home() // releasing twice is harmless
  await flush(100)
  expect(splash()?.classList.contains('orbit-splash--leaving')).toBe(true)
  expect(document.documentElement.classList.contains('orbit-entering')).toBe(true)
  expect(document.documentElement.classList.contains('orbit-booting')).toBe(false)
  await flush(2000)
  expect(splash()).toBeNull()
  expect(document.documentElement.classList.contains('orbit-entering')).toBe(false)
})

it('shows long enough for its animation to read, even when Orbit is ready at once', async () => {
  holdSplash()()
  await flush(SPLASH_MIN_MS - 100)
  expect(splash()?.classList.contains('orbit-splash--leaving')).toBe(false)
  await flush(200)
  expect(splash()?.classList.contains('orbit-splash--leaving')).toBe(true)
})

it('never traps Orbit behind it when a hold is never released', async () => {
  holdSplash()
  await flush(12_000)
  expect(splash()?.classList.contains('orbit-splash--leaving') ?? true).toBe(true)
})

it('reports itself active until it has fully gone, so input waits for Orbit', async () => {
  const release = holdSplash()
  expect(splashActive()).toBe(true)
  release()
  await flush(SPLASH_MIN_MS + 100)
  // Zooming out: Orbit is still moving into place.
  expect(splash()?.classList.contains('orbit-splash--leaving')).toBe(true)
  expect(splashActive()).toBe(true)
  await flush(2000)
  expect(splashActive()).toBe(false)
})
