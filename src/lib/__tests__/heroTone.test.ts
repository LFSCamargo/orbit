import { describe, expect, it } from 'vitest'
import { averageLuminance, relativeLuminance, resolveHeroTone } from '@/lib/heroTone'

function imageDataFromRgb(pixels: Array<[number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], index) => {
    const offset = index * 4
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = 255
  })
  return { data, width: pixels.length, height: 1, colorSpace: 'srgb' } as ImageData
}

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

describe('averageLuminance', () => {
  it('returns 0 for empty image data', () => {
    expect(averageLuminance(imageDataFromRgb([]))).toBe(0)
  })

  it('averages luminance across pixels', () => {
    const avg = averageLuminance(
      imageDataFromRgb([
        [0, 0, 0],
        [255, 255, 255],
      ]),
    )
    expect(avg).toBeCloseTo(0.5)
  })
})

describe('resolveHeroTone', () => {
  it('returns light at or above the threshold', () => {
    expect(resolveHeroTone(0.52)).toBe('light')
    expect(resolveHeroTone(0.9)).toBe('light')
  })

  it('returns dark below the threshold', () => {
    expect(resolveHeroTone(0.519)).toBe('dark')
    expect(resolveHeroTone(0)).toBe('dark')
  })
})
