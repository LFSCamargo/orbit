import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as carouselArtwork from '../../lib/carouselArtwork'
import { CarouselArtwork } from '../CarouselArtwork'

afterEach(() => {
  vi.restoreAllMocks()
})

it('does not keep the previous cover when the tile image url changes', async () => {
  const preload = vi.spyOn(carouselArtwork, 'preloadCarouselArtwork')
  const cached = vi.spyOn(carouselArtwork, 'cachedCarouselArtwork')

  cached.mockImplementation((url) =>
    url === 'https://cdn.example/a.png' ? url : undefined,
  )
  preload.mockImplementation((url) =>
    Promise.resolve(url === 'https://cdn.example/b.png'),
  )

  const { container, rerender } = render(
    <CarouselArtwork image="https://cdn.example/a.png" />,
  )
  const art = () => container.querySelector('.square-game-art') as HTMLElement

  expect(art().style.backgroundImage).toContain('a.png')

  await act(async () => {
    rerender(<CarouselArtwork image="https://cdn.example/b.png" />)
    await Promise.resolve()
  })

  expect(art().style.backgroundImage).not.toContain('a.png')
  await act(async () => {
    await Promise.resolve()
  })
  expect(art().style.backgroundImage).toContain('b.png')
})
