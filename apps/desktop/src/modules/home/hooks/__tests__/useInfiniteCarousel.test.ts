import { expect, it } from 'vitest'
import { shouldLoopCarousel } from '../useInfiniteCarousel'

it('keeps a shelf finite at seven games and loops from eight', () => {
  expect(shouldLoopCarousel(0)).toBe(false)
  expect(shouldLoopCarousel(1)).toBe(false)
  expect(shouldLoopCarousel(7)).toBe(false)
  expect(shouldLoopCarousel(8)).toBe(true)
  expect(shouldLoopCarousel(12)).toBe(true)
})
