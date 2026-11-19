import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ArtworkImage } from '../ArtworkImage'

afterEach(cleanup)

it('keeps a loading frame until image decoding completes', async () => {
  const { container } = render(<ArtworkImage src="/logo.png" alt="Logo" fit="contain" />)
  const img = screen.getByRole('img', { name: 'Logo' })
  let finish!: () => void
  Object.defineProperty(img, 'decode', {
    value: () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  })
  fireEvent.load(img)
  expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
  await act(async () => finish())
  expect(container.firstChild).toHaveAttribute('data-state', 'ready')
  expect(container.firstChild).toHaveAttribute('data-fit', 'contain')
})

it('does not let a late decode replace the next image state', async () => {
  const { container, rerender } = render(<ArtworkImage src="/first.png" alt="Logo" />)
  let finish!: () => void
  Object.defineProperty(screen.getByRole('img'), 'decode', {
    value: () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  })
  fireEvent.load(screen.getByRole('img'))
  rerender(<ArtworkImage src="/second.png" alt="Logo" />)
  await act(async () => fireEvent.load(screen.getByRole('img')))
  expect(container.firstChild).toHaveAttribute('data-state', 'ready')
  await act(async () => finish())
  expect(container.firstChild).toHaveAttribute('data-state', 'ready')
  expect(screen.getByRole('img')).toHaveAttribute('src', '/second.png')
})

it('uses contain fit when requested so logos stay inside their frame', () => {
  const { container } = render(<ArtworkImage src="/logo.png" alt="Logo" fit="contain" />)
  expect(container.firstChild).toHaveClass('[&>img]:object-contain')
  expect(container.firstChild).not.toHaveClass('[&>img]:object-cover')
})

it('stays in flow unless the caller positions it absolutely', () => {
  const { container, rerender } = render(<ArtworkImage src="/logo.png" alt="Logo" />)
  expect(container.firstChild).toHaveClass('relative')
  rerender(<ArtworkImage src="/logo.png" alt="Logo" className="absolute inset-0" />)
  expect(container.firstChild).toHaveClass('absolute')
  expect(container.firstChild).not.toHaveClass('relative')
})

it('stops the loading animation and exposes a fallback when an image fails', () => {
  const { container } = render(<ArtworkImage src="/missing.png" alt="Theme logo" />)
  fireEvent.error(screen.getByRole('img'))
  expect(container.firstChild).toHaveAttribute('data-state', 'error')
  expect(container.querySelector('.artwork-skeleton')).toBeNull()
  expect(screen.getByRole('img', { name: 'Theme logo unavailable' })).toBeVisible()
})

it('reveals the image through the wrapper state, not an attribute on the image', () => {
  // Regression: `data-[state=ready]:[&>img]:opacity-100` compiles to
  // `> img[data-state=ready]`, but the state lives on the wrapper, so every
  // artwork (theme previews included) stayed at opacity 0.
  const { container } = render(<ArtworkImage src="/hero.webp" alt="Hero" />)
  const wrapper = container.firstChild as HTMLElement
  expect(wrapper).toHaveClass('[&[data-state=ready]>img]:opacity-100')
  expect(wrapper).toHaveClass('[&[data-state=error]>img]:invisible')
  expect(wrapper.className).not.toMatch(/data-\[state=[a-z]+\]:\[&>img\]/)
})
