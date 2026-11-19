import { expect, it } from 'vitest'
import { snapToCard, springAtRest, stepSpring } from '../shelfSpring'

function settle(target: number, ms: number) {
  let state = { position: 0, velocity: 0 }
  let peak = 0
  for (let t = 0; t < ms; t += 16) {
    state = stepSpring(state, target, 0.016)
    peak = Math.max(peak, state.position)
  }
  return { state, peak }
}

it('overshoots the target a little before settling, for a bouncy feel', () => {
  const { peak } = settle(200, 1000)
  expect(peak).toBeGreaterThan(205)
  expect(peak).toBeLessThan(230)
})

it('comes to rest on the target within a second', () => {
  const { state } = settle(200, 1000)
  expect(springAtRest(state, 200)).toBe(true)
})

it('stays stable across a long frame', () => {
  const state = stepSpring({ position: 0, velocity: 0 }, 200, 0.25)
  expect(Math.abs(state.position)).toBeLessThan(400)
})

it('snaps to the nearest card edge', () => {
  expect(snapToCard(290, 200, 2000)).toBe(200)
  expect(snapToCard(310, 200, 2000)).toBe(400)
})

it('snaps to the end of a finite shelf instead of back to a card before it', () => {
  expect(snapToCard(94, 200, 94)).toBe(94)
  expect(snapToCard(60, 200, 94)).toBe(94)
  expect(snapToCard(20, 200, 94)).toBe(0)
})

it('keeps the target when the card width is unknown', () => {
  expect(snapToCard(137, 0, 2000)).toBe(137)
})

it('snaps forward to the next card after even a small forward scroll', () => {
  expect(snapToCard(205, 200, 2000, 1)).toBe(400)
  expect(snapToCard(20, 200, 94, 1)).toBe(94)
})

it('snaps back to the previous card after even a small backward scroll', () => {
  expect(snapToCard(395, 200, 2000, -1)).toBe(200)
})

it('keeps a card it already sits on whichever way the wheel went', () => {
  expect(snapToCard(200.4, 200, 2000, 1)).toBe(200)
  expect(snapToCard(399.6, 200, 2000, -1)).toBe(400)
})
