import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ProgressiveArtwork } from '../ProgressiveArtwork'

afterEach(cleanup)

function images(container: HTMLElement) {
  return [...container.querySelectorAll('img')]
}

it('shows the low-res preview until the full image has decoded', async () => {
  const { container } = render(
    <ProgressiveArtwork
      sources={{ low: '/low.jpg', high: '/high.jpg', high2x: '/high@2x.jpg' }}
      alt="Cyberpunk 2077"
    />,
  )
  const root = container.firstElementChild as HTMLElement
  expect(root).toHaveAttribute('data-state', 'loading')
  const [low, high] = images(container)
  expect(low).toHaveAttribute('src', '/low.jpg')
  expect(high).toHaveAttribute('srcset', '/high.jpg 1x, /high@2x.jpg 2x')
  fireEvent.load(high)
  await screen.findByRole('img', { name: 'Cyberpunk 2077' })
  expect(root).toHaveAttribute('data-state', 'ready')
})

it('falls back to the preview and placeholder when the full image fails', () => {
  const { container } = render(
    <ProgressiveArtwork
      sources={{ low: '/low.jpg', high: '/missing.jpg' }}
      placeholder="linear-gradient(red, blue)"
      alt="Game"
    />,
  )
  fireEvent.error(images(container)[1])
  const root = container.firstElementChild as HTMLElement
  expect(root).toHaveAttribute('data-state', 'error')
  expect(root.style.backgroundImage).toContain('linear-gradient')
  expect(images(container)[0]).toHaveAttribute('src', '/low.jpg')
})

it('renders only the placeholder when there is no artwork', () => {
  const { container } = render(
    <ProgressiveArtwork
      sources={{}}
      placeholder="linear-gradient(red, blue)"
      alt="Game"
    />,
  )
  expect(images(container)).toHaveLength(0)
  expect(container.firstElementChild).toHaveAttribute('data-state', 'empty')
})

it('starts over when the artwork changes', () => {
  const { container, rerender } = render(
    <ProgressiveArtwork sources={{ high: '/a.jpg' }} alt="Game" />,
  )
  fireEvent.load(images(container)[0])
  rerender(<ProgressiveArtwork sources={{ high: '/b.jpg' }} alt="Game" />)
  expect(container.firstElementChild).toHaveAttribute('data-state', 'loading')
})
