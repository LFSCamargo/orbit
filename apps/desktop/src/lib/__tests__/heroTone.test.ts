import { describe, expect, it } from 'vitest'
import { relativeLuminance } from '@/lib/heroTone'

describe('relativeLuminance', () => {
  it('returns 0 for black and ~1 for white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1)
  })

  it('weights green more heavily than red or blue', () => {
    const green = relativeLuminance(0, 255, 0)
    const red = relativeLuminance(255, 0, 0)
    const blue = relativeLuminance(0, 0, 255)
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })
})
