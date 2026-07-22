import { useEffect, useState } from 'react'
import { renderBlurredHero } from '@/lib/heroBlur'

/**
 * Builds a cached canvas blur for the hero image.
 * Keeps the previous blur visible while the next one renders (no flash).
 */
export function useHeroBlur(imageUrl: string | null): string | null {
  const [blurredSrc, setBlurredSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!imageUrl) return

    let cancelled = false
    void renderBlurredHero(imageUrl).then((src) => {
      if (!cancelled && src) setBlurredSrc(src)
    })

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return blurredSrc
}
