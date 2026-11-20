import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ThemePreviewGallery } from '../ThemePreviewGallery'

it('shows the real theme screenshot selected by each thumbnail', () => {
  render(<ThemePreviewGallery />)
  const themes = [
    ['Devil May Cry 5', 'devil-may-cry-5'],
    ['God of War', 'god-of-war'],
    ['Cyberpunk 2077', 'cyberpunk-2077'],
    ['Zelda: Ocarina of Time Remake', 'zelda-ocarina-of-time'],
    ['Grand Theft Auto VI', 'gta-vi'],
  ]
  expect(
    screen.getByRole('button', { name: 'Preview Devil May Cry 5 theme' }),
  ).toHaveAttribute('aria-pressed', 'true')
  for (const [name, slug] of themes) {
    fireEvent.click(screen.getByRole('button', { name: `Preview ${name} theme` }))
    expect(
      decodeURIComponent(
        screen
          .getByRole('img', { name: `Orbit with the ${name} theme applied` })
          .getAttribute('src') ?? '',
      ),
    ).toContain(`/screenshots/themes/${slug}.jpg`)
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true'),
    ).toHaveLength(1)
    expect(screen.getByRole('button', { name: `Preview ${name} theme` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
})
