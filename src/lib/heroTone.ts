export type HeroTone = 'light' | 'dark'

const LIGHT_THRESHOLD = 0.52

export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function averageLuminance(imageData: ImageData): number {
  const { data } = imageData
  const pixels = data.length / 4
  if (pixels === 0) return 0

  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += relativeLuminance(data[i], data[i + 1], data[i + 2])
  }
  return sum / pixels
}

export function resolveHeroTone(luminance: number): HeroTone {
  return luminance >= LIGHT_THRESHOLD ? 'light' : 'dark'
}

export async function detectHeroTone(imageUrl: string | null): Promise<HeroTone> {
  if (!imageUrl) return 'dark'

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const width = 64
        const height = 64
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve('dark')
          return
        }

        const sampleWidth = img.naturalWidth * 0.58
        const sampleHeight = img.naturalHeight * 0.48
        ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight, 0, 0, width, height)

        const tone = resolveHeroTone(averageLuminance(ctx.getImageData(0, 0, width, height)))
        resolve(tone)
      } catch {
        resolve('dark')
      }
    }

    img.onerror = () => resolve('dark')
    img.src = imageUrl
  })
}
