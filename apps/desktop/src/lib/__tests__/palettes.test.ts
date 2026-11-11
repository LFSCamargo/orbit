import { describe, expect, it } from 'vitest'
import { PALETTE_PRESETS, extractPaletteFromPixels } from '@/lib/palettes'

function rgba(r: number, g: number, b: number, a = 255): number[] {
  return [r, g, b, a]
}

function fillPixels(
  width: number,
  height: number,
  colors: number[][],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  const blockSize = Math.ceil((width * height) / colors.length)
  for (let i = 0; i < width * height; i++) {
    const colorIndex = Math.min(colors.length - 1, Math.floor(i / blockSize))
    const color = colors[colorIndex] ?? [0, 0, 0, 255]
    data.set(color, i * 4)
  }
  return data
}

describe('PALETTE_PRESETS', () => {
  it('covers every theme color slot', () => {
    for (const preset of PALETTE_PRESETS) {
      expect(Object.keys(preset.colors).sort()).toEqual([
        'accent',
        'border',
        'canvas',
        'focus',
        'foreground',
        'muted',
        'panel',
        'surface',
      ])
    }
  })

  it('uses valid hex colors', () => {
    const hex = /^#[0-9a-f]{6}$/i
    for (const preset of PALETTE_PRESETS) {
      for (const value of Object.values(preset.colors)) {
        expect(value).toMatch(hex)
      }
    }
  })
})

describe('extractPaletteFromPixels', () => {
  it('returns null when there are not enough distinct colors', () => {
    const data = fillPixels(4, 4, [rgba(10, 10, 10)])
    expect(extractPaletteFromPixels(data)).toBeNull()
  })

  it('maps a dominant color to a dark palette', () => {
    const data = fillPixels(32, 32, [
      rgba(20, 20, 20),
      rgba(20, 20, 20),
      rgba(20, 20, 20),
      rgba(80, 80, 80),
      rgba(140, 140, 140),
      rgba(200, 200, 200),
    ])
    const result = extractPaletteFromPixels(data)
    expect(result).not.toBeNull()
    expect(result!.canvas).toMatch(/^#/)
    expect(result!.accent).toMatch(/^#/)
  })

  it('extracts distinct light, dark and accent colors', () => {
    const data = fillPixels(32, 32, [
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(10, 10, 10),
      rgba(200, 200, 200),
      rgba(255, 100, 50),
      rgba(40, 40, 40),
    ])
    const result = extractPaletteFromPixels(data)
    expect(result).not.toBeNull()
    expect(result!.foreground).not.toBe(result!.canvas)
    expect(result!.accent).toMatch(/^#/)
  })
})
