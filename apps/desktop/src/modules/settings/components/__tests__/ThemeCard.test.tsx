import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { BUILT_IN_THEMES } from '@/themes/catalog'
import { ThemeCard } from '../ThemeCard'

afterEach(cleanup)

it('renders native catalog thumbnails rather than full custom images', () => {
  const theme = {
    ...BUILT_IN_THEMES[0],
    id: 'custom-cached',
    kind: 'custom' as const,
    branding: { logoImage: '/full/logo.png', wallpaper: '/full/hero.png' },
    preview: { logo: '/small/logo.png', hero: '/small/hero.jpg' },
  }
  const { container } = render(
    <ThemeCard theme={theme} active={false} order={0} onSelect={() => {}} />,
  )
  const sources = [...container.querySelectorAll('img')].map((img) =>
    img.getAttribute('src'),
  )
  expect(sources).toHaveLength(2)
  expect(sources.every((src) => src?.includes('/small/'))).toBe(true)
})

it('does not fall back to decoding an animated original when the catalog has no thumbnail', () => {
  const theme = {
    ...BUILT_IN_THEMES[0],
    id: 'custom-animated',
    kind: 'custom' as const,
    branding: { wallpaper: '/full/animated.gif' },
    preview: { logo: null, hero: null },
  }
  const { container } = render(
    <ThemeCard theme={theme} active={false} order={0} onSelect={() => {}} />,
  )
  expect(container.querySelectorAll('img')).toHaveLength(0)
})
