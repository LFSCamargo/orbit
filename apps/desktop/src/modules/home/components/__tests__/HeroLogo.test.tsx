import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { HeroLogo } from '../HeroLogo'

afterEach(cleanup)

it('hides a logo that fails to load and tries the next game’s logo', () => {
  // Regression: The Expendabros has no Steam logo.png, and the home hero
  // showed the browser's broken-image box under the toolbar.
  const missing = 'https://cdn.akamai.steamstatic.com/steam/apps/312990/logo.png'
  const present = 'https://cdn.akamai.steamstatic.com/steam/apps/1593500/logo.png'
  const { container, rerender } = render(<HeroLogo src={missing} />)
  const img = container.querySelector('img')
  expect(img?.getAttribute('src')).toBe(missing)

  fireEvent.error(img!)
  expect(container.querySelector('img')).toBeNull()

  rerender(<HeroLogo src={present} />)
  expect(container.querySelector('img')?.getAttribute('src')).toBe(present)
})

it('renders nothing without a logo', () => {
  const { container } = render(<HeroLogo src={undefined} />)
  expect(container.querySelector('img')).toBeNull()
})
