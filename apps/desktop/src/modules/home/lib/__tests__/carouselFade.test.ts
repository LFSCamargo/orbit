import { expect, it } from 'vitest'
import { shelfEdgeFade, shelfFadeMaskClass } from '../carouselFade'

it('does not fade a shelf that fits on screen', () => {
  expect(shelfEdgeFade(0, 1200, 800)).toBe('none')
  expect(shelfFadeMaskClass('none')).toBe('')
})

it('fades only the overflowing side', () => {
  expect(shelfEdgeFade(0, 800, 1600)).toBe('right')
  expect(shelfEdgeFade(800, 800, 1600)).toBe('left')
  expect(shelfEdgeFade(200, 800, 1600)).toBe('both')
})

it('uses a two-sided mask only when both edges overflow', () => {
  expect(shelfFadeMaskClass('left')).toContain('[mask-image:')
  expect(shelfFadeMaskClass('right')).toContain('[mask-image:')
  expect(shelfFadeMaskClass('both')).toContain('transparent)]')
  expect(shelfFadeMaskClass('both')).toContain('black_5.5rem')
  expect(shelfFadeMaskClass('left')).not.toContain('calc(100%-5.5rem)')
  expect(shelfFadeMaskClass('right')).not.toContain('transparent,black_5.5rem')
})
