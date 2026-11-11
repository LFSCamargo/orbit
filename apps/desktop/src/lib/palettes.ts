import type { ThemeColors } from '@/themes/types'

export type PalettePreset = {
  id: string
  name: string
  colors: Record<keyof ThemeColors, string>
}

/** Landing-page brand palette and a few curated alternatives. */
export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'landing',
    name: 'Orbit',
    colors: {
      canvas: '#080809',
      surface: '#0f0f11',
      panel: '#17171a',
      foreground: '#f5f5f4',
      muted: '#a1a1aa',
      accent: '#fb923c',
      focus: '#fde047',
      border: '#3f3f46',
    },
  },
  {
    id: 'liquid-glass',
    name: 'Liquid Glass',
    colors: {
      canvas: '#05070c',
      surface: '#0c1018',
      panel: '#121822',
      foreground: '#f4f6fa',
      muted: '#94a0b2',
      accent: '#78c4ff',
      focus: '#b4dcff',
      border: '#2a3444',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    colors: {
      canvas: '#0c0505',
      surface: '#1a0f0f',
      panel: '#261616',
      foreground: '#faf4f4',
      muted: '#c4a0a0',
      accent: '#ef4444',
      focus: '#fca5a5',
      border: '#442a2a',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: {
      canvas: '#05100a',
      surface: '#0f1f16',
      panel: '#162b20',
      foreground: '#f4faf7',
      muted: '#a0c4b0',
      accent: '#22c55e',
      focus: '#86efac',
      border: '#2a4436',
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    colors: {
      canvas: '#0a0510',
      surface: '#150f1f',
      panel: '#1f162b',
      foreground: '#f7f4fa',
      muted: '#b8a0c4',
      accent: '#a855f7',
      focus: '#d8b4fe',
      border: '#3d2a44',
    },
  },
  {
    id: 'sakura',
    name: 'Sakura',
    colors: {
      canvas: '#10050a',
      surface: '#1f0f16',
      panel: '#2b1620',
      foreground: '#faf4f7',
      muted: '#c4a0b0',
      accent: '#ec4899',
      focus: '#f9a8d4',
      border: '#442a36',
    },
  },
]

function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function hexFromRgb({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Extract a small palette from raw RGBA pixel data.
 * Returns eight hex colors mapped to the theme slots.
 */
export function extractPaletteFromPixels(
  data: Uint8ClampedArray,
): Record<keyof ThemeColors, string> | null {
  const buckets = new Map<string, number>()

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128) continue
    const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }

  const sorted = Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number)
      return { r, g, b, lum: luminance({ r, g, b }) }
    })
    .filter((color, index, arr) => {
      // Remove near-duplicates.
      for (let i = 0; i < index; i++) {
        const other = arr[i]
        const dist = Math.hypot(color.r - other.r, color.g - other.g, color.b - other.b)
        if (dist < 32) return false
      }
      return true
    })

  if (sorted.length < 4) return null

  // Sort by luminance so we can assign dark→light to canvas/surface/panel/foreground.
  const byLum = [...sorted].sort((a, b) => a.lum - b.lum)
  const darkest = byLum[0]
  const dark = byLum[Math.floor(byLum.length * 0.25)] ?? byLum[1]
  const mid = byLum[Math.floor(byLum.length * 0.5)] ?? byLum[2]
  const light = byLum[byLum.length - 1]

  // Pick an accent from the most saturated non-extreme color.
  const accent =
    sorted
      .filter((c) => c !== darkest && c !== light)
      .sort(
        (a, b) =>
          saturation(b.r, b.g, b.b) * (1 - Math.abs(b.lum - 0.5)) -
          saturation(a.r, a.g, a.b) * (1 - Math.abs(a.lum - 0.5)),
      )[0] ?? mid

  return {
    canvas: darken(darkest, 0.35),
    surface: hexFromRgb(dark),
    panel: hexFromRgb(mid),
    foreground: lighten(light, 0.1),
    muted: hexFromRgb({
      r: Math.round((mid.r + light.r) / 2),
      g: Math.round((mid.g + light.g) / 2),
      b: Math.round((mid.b + light.b) / 2),
    }),
    accent: hexFromRgb(accent),
    focus: lighten(accent, 0.35),
    border: hexFromRgb({
      r: Math.round((dark.r + mid.r) / 2),
      g: Math.round((dark.g + mid.g) / 2),
      b: Math.round((dark.b + mid.b) / 2),
    }),
  }
}

/**
 * Extract a small palette from an image data URL using a canvas.
 * Returns eight hex colors mapped to the theme slots.
 */
export async function extractPaletteFromImage(
  dataUrl: string,
): Promise<Record<keyof ThemeColors, string> | null> {
  const img = await loadImage(dataUrl)
  if (!img) return null

  const canvas = document.createElement('canvas')
  const size = 64
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, size, size)

  const { data } = ctx.getImageData(0, 0, size, size)
  return extractPaletteFromPixels(data)
}

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timeout = window.setTimeout(() => resolve(null), 3000)
    img.onload = () => {
      window.clearTimeout(timeout)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(timeout)
      resolve(null)
    }
    img.src = dataUrl
  })
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function darken(color: { r: number; g: number; b: number }, amount: number): string {
  return hexFromRgb({
    r: Math.round(color.r * (1 - amount)),
    g: Math.round(color.g * (1 - amount)),
    b: Math.round(color.b * (1 - amount)),
  })
}

function lighten(color: { r: number; g: number; b: number }, amount: number): string {
  return hexFromRgb({
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount),
  })
}
