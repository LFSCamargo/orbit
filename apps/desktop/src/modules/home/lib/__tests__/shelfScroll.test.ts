import { expect, it, vi } from 'vitest'
import {
  SHELF_FOCUS_SCROLL_MS,
  animateScrollBy,
  easeOutCubic,
  focusKeepInViewDelta,
  shiftShelfScrollAnimation,
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
