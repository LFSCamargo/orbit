import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Planet } from '../Planet'

vi.mock('../OrbitGlobe', () => ({
  default: () => <div data-testid="orbit-globe" />,
}))

afterEach(() => vi.unstubAllGlobals())

it('draws the photo planet with its fire rim, without waiting for WebGL', () => {
  const { container } = render(<Planet />)
  const planet = container.querySelector('.planet')
  expect(planet).not.toBeNull()
  expect(planet?.querySelector('img')?.getAttribute('src')).toBe(
    '/assets/space/globe.webp',
  )
  // jsdom has no WebGL: the 3D globe is never requested.
  expect(container.querySelector('[data-testid="orbit-globe"]')).toBeNull()
  expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
})

it('leaves the planet out on phones; it is for the desktop web', () => {
  const { container } = render(<Planet />)
  expect(container.firstElementChild).toHaveClass('max-md:hidden')
})
