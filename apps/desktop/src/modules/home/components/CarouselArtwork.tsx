import { useEffect, useLayoutEffect, useState, type ComponentProps } from 'react'
import { SquareGameArt } from '@/components/game/SquareGameArt'
import { preloadCarouselArtwork, cachedCarouselArtwork } from '../lib/carouselArtwork'

export function CarouselArtwork(props: ComponentProps<typeof SquareGameArt>) {
  const url = props.image
  const [ready, setReady] = useState(() => Boolean(url && cachedCarouselArtwork(url)))

  useLayoutEffect(() => {
    if (!url) {
      setReady(false)
      return
    }
    setReady(Boolean(cachedCarouselArtwork(url)))
  }, [url])

  useEffect(() => {
    if (!url) return
    if (cachedCarouselArtwork(url)) {
      setReady(true)
      return
    }
    let active = true
    setReady(false)
    void preloadCarouselArtwork(url).then((ok) => {
      if (active && ok) setReady(true)
    })
    return () => {
      active = false
    }
  }, [url])

  const image = url && ready ? url : undefined
  return <SquareGameArt {...props} image={image} />
}
