import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Game } from '@/types/game'
import { DetailsHero } from '../DetailsHero'

const game = {
  id: 'steam:1593500',
  title: 'God of War',
  provider: 'steam',
  platform: 'windows',
  favorite: false,
  artwork: { portrait: 'https://cdn/library_600x900.jpg' },
} as unknown as Game

// Regression: on 1x monitors WebKit painted the tilted cover in place, so the
// art looked pixelated and its edges jagged. On its own GPU layer it is drawn
// upright and rotated with filtering.
it('draws the tilted cover on its own GPU layer so it stays smooth', () => {
  const { container } = render(<DetailsHero game={game} />)
  const tilt = container.querySelector('.details-cover-wrap')
  expect(tilt?.className).toContain('rotate-[5deg]')
  expect(tilt?.className).toContain('transform-gpu')
  expect(tilt?.className).toContain('will-change-transform')
  expect(tilt?.className).toContain('[backface-visibility:hidden]')
})
