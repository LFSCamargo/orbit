import { useEffect, useState } from 'react'
import { detectHeroTone, type HeroTone } from '@/lib/heroTone'

export function useHeroTone(imageUrl: string | null): HeroTone {
  const [tone, setTone] = useState<HeroTone>('dark')

  useEffect(() => {
    let cancelled = false

    void detectHeroTone(imageUrl).then((next) => {
      if (!cancelled) setTone(next)
    })

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  return tone
}
