import { expect, it } from 'vitest'
import { StickNavigator } from '../stickNavigator'

it('moves once on a flick and repeats only after the same delay as the D-pad', () => {
  const stick = new StickNavigator()
  expect(stick.update(0, 0.9, 0)).toEqual({ action: 'navigate-down', repeating: false })
  expect(stick.update(0, 0.9, 200)).toBeNull()
  expect(stick.update(0, 0.9, 380)).toEqual({ action: 'navigate-down', repeating: true })
  expect(stick.update(0, 0.9, 450)).toBeNull()
  expect(stick.update(0, 0.9, 520)).toEqual({ action: 'navigate-down', repeating: true })
})

it('needs the stick to come back toward center before the next flick', () => {
  const stick = new StickNavigator()
  expect(stick.update(0.8, 0, 0)?.action).toBe('navigate-right')
  // Wobbling between the release and engage thresholds keeps the hold.
  expect(stick.update(0.4, 0, 30)).toBeNull()
  expect(stick.update(0.8, 0, 60)).toBeNull()
  expect(stick.update(0.1, 0, 90)).toBeNull()
  expect(stick.update(0.8, 0, 120)).toEqual({
    action: 'navigate-right',
    repeating: false,
  })
})

it('turns at once when the stick swings to another direction', () => {
  const stick = new StickNavigator()
  expect(stick.update(0, -0.9, 0)?.action).toBe('navigate-up')
  expect(stick.update(-0.9, -0.1, 40)).toEqual({
    action: 'navigate-left',
    repeating: false,
  })
})

it('ignores small drift inside the deadzone', () => {
  const stick = new StickNavigator()
  expect(stick.update(0.3, -0.25, 0)).toBeNull()
})
