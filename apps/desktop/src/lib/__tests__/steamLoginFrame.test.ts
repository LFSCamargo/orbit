import { expect, it } from 'vitest'
import {
  STEAM_LOGIN_HEIGHT,
  STEAM_LOGIN_WIDTH,
  steamLoginHostFrame,
} from '@/lib/steamLoginFrame'

it("sends the host's viewport box so Rust can pin Steam inside Orbit", () => {
  expect(steamLoginHostFrame({ left: 40.4, top: 80.6 })).toEqual({
    x: 40,
    y: 81,
    width: STEAM_LOGIN_WIDTH,
    height: STEAM_LOGIN_HEIGHT,
  })
  expect(STEAM_LOGIN_WIDTH).toBe(840)
  expect(STEAM_LOGIN_HEIGHT).toBe(520)
})

it('uses the actual host size so a compact Orbit window contains Steam', () => {
  expect(steamLoginHostFrame({ left: 24, top: 80, width: 760, height: 440 })).toEqual({
    x: 24,
    y: 80,
    width: 760,
    height: 440,
  })
})
