import { expect, it, vi } from 'vitest'
import {
  SHELF_FOCUS_SCROLL_MS,
  animateScrollBy,
  easeOutCubic,
  focusKeepInViewDelta,
  shiftShelfScrollAnimation,
  springScrollBy,
  wheelScrollTarget,
} from '../shelfScroll'

it('keeps a centered card still', () => {
  expect(focusKeepInViewDelta({ left: 300, right: 480, width: 180 }, 1000, 1000)).toBe(0)
})

it('pulls a left-edge card inward by one card plus gap', () => {
  expect(focusKeepInViewDelta({ left: 0, right: 180, width: 180 }, 1000, 1000)).toBe(-202)
})

it('pulls a right-edge card inward', () => {
  expect(focusKeepInViewDelta({ left: 850, right: 1030, width: 180 }, 1000, 1000)).toBe(
    232,
  )
})

it('eases out so the last stretch of the scroll is slower', () => {
  expect(easeOutCubic(0)).toBe(0)
  expect(easeOutCubic(1)).toBe(1)
  expect(easeOutCubic(0.5)).toBeLessThan(0.9)
  expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
})

it('jumps immediately when motion is reduced', () => {
  const element = { scrollLeft: 400 }
  animateScrollBy(element, 80, { reduceMotion: true })
  expect(element.scrollLeft).toBe(480)
})

it('animates over the couch-friendly duration', () => {
  const element = { scrollLeft: 0 }
  let now = 0
  const frames: Array<(time: number) => void> = []
  animateScrollBy(element, 100, {
    now: () => now,
    frame: (cb) => {
      frames.push(cb)
      return frames.length
    },
    cancel: vi.fn(),
  })
  expect(frames).toHaveLength(1)
  now = SHELF_FOCUS_SCROLL_MS / 2
  frames[0](now)
  expect(element.scrollLeft).toBeGreaterThan(50)
  expect(element.scrollLeft).toBeLessThan(100)
  now = SHELF_FOCUS_SCROLL_MS
  frames[1](now)
  expect(element.scrollLeft).toBe(100)
})

it('keeps an in-flight shelf scroll moving forward after a loop rebase', () => {
  const element = { scrollLeft: 1800 }
  let now = 0
  const frames: Array<(time: number) => void> = []
  animateScrollBy(element, 200, {
    now: () => now,
    frame: (cb) => {
      frames.push(cb)
      return frames.length
    },
    cancel: vi.fn(),
  })
  now = SHELF_FOCUS_SCROLL_MS / 2
  frames[0](now)
  const beforeRebase = element.scrollLeft
  const shift = -900
  shiftShelfScrollAnimation(element, shift)
  element.scrollLeft = beforeRebase + shift
  now = SHELF_FOCUS_SCROLL_MS
  frames[1](now)
  expect(element.scrollLeft).toBe(1800 + 200 + shift)
})

function wheelHarness(scrollLeft = 0) {
  const element = { scrollLeft, scrollWidth: 4000, clientWidth: 800 }
  let now = 0
  const frames: Array<(time: number) => void> = []
  const options = {
    stride: 200,
    now: () => now,
    frame: (cb: (time: number) => void) => frames.push(cb),
    cancel: vi.fn(),
  }
  const run = (ms: number) => {
    for (let end = now + ms; now < end;) {
      now += 16
      frames.shift()?.(now)
    }
  }
  return { element, options, frames, run }
}

it('springs wheel scrolling past the target and back, then lands on a card', () => {
  const { element, options, run } = wheelHarness()
  springScrollBy(element, 150, options)
  springScrollBy(element, 120, options)
  let peak = 0
  for (let i = 0; i < 60; i++) {
    run(16)
    peak = Math.max(peak, element.scrollLeft)
  }
  expect(peak).toBeGreaterThan(400)
  expect(element.scrollLeft).toBe(400)
  expect(wheelScrollTarget(element)).toBeUndefined()
})

it('reports where the wheel is heading while it springs', () => {
  const { element, options } = wheelHarness()
  springScrollBy(element, 150, options)
  expect(wheelScrollTarget(element)).toBe(150)
})

it('keeps the wheel spring inside a finite shelf', () => {
  const { element, options } = wheelHarness(3100)
  springScrollBy(element, 500, options)
  expect(wheelScrollTarget(element)).toBe(3200)
})

it('jumps straight there when motion is reduced', () => {
  const { element, options, frames } = wheelHarness()
  springScrollBy(element, 150, { ...options, reduceMotion: true })
  expect(element.scrollLeft).toBe(150)
  expect(frames).toHaveLength(0)
})

it('carries the wheel spring across a loop rebase', () => {
  const { element, options, run } = wheelHarness(2000)
  springScrollBy(element, 200, options)
  run(64)
  shiftShelfScrollAnimation(element, -1000)
  element.scrollLeft -= 1000
  run(1200)
  expect(element.scrollLeft).toBe(1200)
})

it('lets go when something else scrolls the shelf', () => {
  const { element, options, run } = wheelHarness()
  springScrollBy(element, 200, options)
  run(32)
  element.scrollLeft = 900
  run(500)
  expect(element.scrollLeft).toBe(900)
  expect(wheelScrollTarget(element)).toBeUndefined()
})

it('a controller focus scroll takes over from the wheel spring', () => {
  const { element, options } = wheelHarness()
  springScrollBy(element, 200, options)
  animateScrollBy(element, 50, { reduceMotion: true })
  expect(wheelScrollTarget(element)).toBeUndefined()
})

it('moves a whole card for a small wheel nudge instead of springing back', () => {
  const { element, options, run } = wheelHarness()
  springScrollBy(element, 20, options)
  run(1500)
  expect(element.scrollLeft).toBe(200)
})

it('moves back a whole card for a small backward nudge', () => {
  const { element, options, run } = wheelHarness(400)
  springScrollBy(element, -15, options)
  run(1500)
  expect(element.scrollLeft).toBe(200)
})

it('carries a big wheel flick across several cards', () => {
  const { element, options, run } = wheelHarness()
  springScrollBy(element, 900, options)
  run(1500)
  expect(element.scrollLeft).toBe(1000)
})

it('a steady stream of tiny wheel steps keeps the shelf moving', () => {
  const { element, options, run } = wheelHarness()
  for (let i = 0; i < 40; i++) {
    springScrollBy(element, 8, options)
    run(16)
  }
  run(1500)
  expect(element.scrollLeft).toBe(400)
})
