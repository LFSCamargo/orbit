import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EpicGamesIcon, XboxIcon } from '../AccountIcons'

afterEach(cleanup)

it('names the Xbox mark when labelled and hides it otherwise', () => {
  const { container, rerender } = render(<XboxIcon size={20} label="Xbox" />)
  expect(screen.getByRole('img', { name: 'Xbox' })).toHaveAttribute('width', '20')
  rerender(<XboxIcon />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
})

it('keeps the Epic Games mark in its own colours and proportions', () => {
  render(<EpicGamesIcon size={30} label="Epic Games" />)
  const icon = screen.getByRole('img', { name: 'Epic Games' })
  expect(icon).toHaveAttribute('src', expect.stringContaining('epic-games'))
  expect(icon).toHaveAttribute('height', '30')
  expect(icon).toHaveAttribute('width', '26')
})

it('is decorative without a label', () => {
  const { container } = render(<EpicGamesIcon />)
  expect(container.querySelector('img')).toHaveAttribute('alt', '')
})
