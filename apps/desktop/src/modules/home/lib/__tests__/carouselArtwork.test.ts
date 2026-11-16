import { expect, it, vi } from 'vitest'
import { preloadCarouselArtwork } from '../carouselArtwork'

it('shares one decoded image between repeated carousel cards', async () => {
  const decode = vi.fn().mockResolvedValue(undefined)
  const construct = vi.fn()
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode = decode
      constructor() {
        construct()
      }
    },
  )
  const first = preloadCarouselArtwork('/test-carousel.jpg')
  const second = preloadCarouselArtwork('/test-carousel.jpg')
  expect(first).toBe(second)
  await expect(first).resolves.toBe(true)
  expect(construct).toHaveBeenCalledTimes(1)
  expect(decode).toHaveBeenCalledTimes(1)
  vi.unstubAllGlobals()
})
