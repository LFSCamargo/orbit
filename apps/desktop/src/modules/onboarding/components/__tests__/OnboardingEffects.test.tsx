import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { meteorField } from '../space/Meteors'
import { OnboardingEffects } from '../OnboardingEffects'

/** Keyframes and classes live in styles/index.css; e2e checks they run. */
it('falls back to the CSS planet and stars without WebGL or canvas', () => {
  // jsdom has neither, like a webview with GPU acceleration off.
  const { container } = render(<OnboardingEffects />)
  for (const name of [
    'space-twinkle',
    'space-drift',
    'nebula-drift',
    'meteor',
    'planet-turn',
    'glow-breathe',
    'ember-rise',
  ]) {
    expect(container.querySelector(`.${name}`), name).not.toBeNull()
  }
  expect(container.querySelector('.space-globe')).toBeNull()
})

it('lays out the same star field and meteors every time', () => {
  const positions = () =>
    [...render(<OnboardingEffects />).container.querySelectorAll<HTMLElement>('.star')]
      .map((star) => `${star.style.left},${star.style.top}`)
      .join(';')
  expect(positions()).toBe(positions())
  expect(meteorField(14)).toEqual(meteorField(14))
})

it('spreads meteors across the whole width, starting above the sky', () => {
  const field = meteorField(14)
  expect(Math.min(...field.map((m) => m.left))).toBeLessThan(5)
  expect(Math.max(...field.map((m) => m.left))).toBeGreaterThan(100)
  expect(field.every((m) => m.top < 0)).toBe(true)
})
