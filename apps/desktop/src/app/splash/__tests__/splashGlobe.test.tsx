import { act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { holdSplash, reopenSplash, resetSplashForTests, SPLASH_MIN_MS } from '../splash'
import { mountSplashGlobe, SPLASH_GLOBE_WAIT_MS } from '../splashGlobe'

let ready: (() => void) | undefined
const FakeGlobe = ({ onReady }: { onReady?: () => void }) => {
  ready = onReady
  return <canvas data-testid="globe" />
}
const load = () => Promise.resolve({ default: FakeGlobe })

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<div id="orbit-splash"><div id="orbit-splash-globe"></div></div><div id="root"></div>'
  resetSplashForTests()
  ready = undefined
})
afterEach(() => vi.useRealTimers())

const leaving = () =>
  document.getElementById('orbit-splash')?.classList.contains('orbit-splash--leaving')

it('spins the 3D globe on a GPU and keeps the splash up until it has drawn', async () => {
  const boot = holdSplash()
  await act(async () => mountSplashGlobe({ tier: 'gpu', reducedMotion: false, load }))
  expect(document.querySelector('#orbit-splash-globe canvas')).not.toBeNull()
  boot()
  await act(() => vi.advanceTimersByTimeAsync(SPLASH_MIN_MS + 200))
  expect(leaving()).toBe(false)
  act(() => ready?.())
  expect(document.getElementById('orbit-splash-globe')?.dataset.ready).toBe('true')
  await act(() => vi.advanceTimersByTimeAsync(200))
  expect(leaving()).toBe(true)
  // Once the splash has gone, the WebGL scene is torn down with it.
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(document.querySelector('canvas')).toBeNull()
})

it('never waits long on a globe that does not draw', async () => {
  const boot = holdSplash()
  await act(async () => mountSplashGlobe({ tier: 'gpu', reducedMotion: false, load }))
  boot()
  await act(() => vi.advanceTimersByTimeAsync(SPLASH_GLOBE_WAIT_MS + 100))
  expect(leaving()).toBe(true)
})

it('keeps the photo planet without a GPU or with reduced motion', async () => {
  for (const options of [
    { tier: 'software' as const, reducedMotion: false },
    { tier: 'gpu' as const, reducedMotion: true },
  ]) {
    await act(async () => mountSplashGlobe({ ...options, load }))
    expect(document.querySelector('#orbit-splash-globe canvas')).toBeNull()
  }
})

it('spins the globe again each time the splash comes back', async () => {
  const boot = holdSplash()
  await act(async () => mountSplashGlobe({ tier: 'gpu', reducedMotion: false, load }))
  act(() => ready?.())
  boot()
  await act(() => vi.advanceTimersByTimeAsync(SPLASH_MIN_MS + 3000))
  expect(document.querySelector('canvas')).toBeNull()
  await act(async () => {
    reopenSplash()
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(document.querySelector('#orbit-splash-globe canvas')).not.toBeNull()
})
