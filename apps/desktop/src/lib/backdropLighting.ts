import { relativeLuminance } from './heroTone'

export type BackdropLighting = [number, number, number]

const GRID = 16

/** Sample a small strip near the top, where the navigation glass sits. */
export function sampleBackdropLighting(image: HTMLImageElement): BackdropLighting | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = GRID
    canvas.height = GRID
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      Math.max(1, image.naturalHeight / 4),
      0,
      0,
      GRID,
      GRID,
    )
    const { data } = ctx.getImageData(0, 0, GRID, GRID)
    const rgb: BackdropLighting = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255
      rgb[0] += data[i] * alpha
      rgb[1] += data[i + 1] * alpha
      rgb[2] += data[i + 2] * alpha
    }
    return rgb.map((value) => Math.round(value / (GRID * GRID))) as BackdropLighting
  } catch {
    return null
  }
}

export function glassTint(lighting: BackdropLighting | null): string {
  const [red, green, blue] = lighting ?? [160, 160, 160]
  const light = relativeLuminance(red, green, blue)
  const color = [red, green, blue].map((channel) => 8 + Math.round(channel * 0.13))
  const opacity = 0.25 + 0.58 * light
  return `rgb(${color.join(' ')} / ${opacity.toFixed(3)})`
}
