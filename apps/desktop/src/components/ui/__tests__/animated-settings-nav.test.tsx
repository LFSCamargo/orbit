import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LayoutGrid, Palette } from 'lucide-react'
import { afterEach, expect, it } from 'vitest'
import { AnimatedSettingsNav } from '../animated-settings-nav'

afterEach(cleanup)

const ITEMS = [
  { id: 'general', label: 'General', icon: LayoutGrid },
  { id: 'themes', label: 'Themes', icon: Palette },
] as const

function Nav() {
  const [value, setValue] = useState<(typeof ITEMS)[number]['id']>('general')
  return <AnimatedSettingsNav items={[...ITEMS]} value={value} onChange={setValue} />
}

it('fills the active settings tab so the selection is a glass pill, not a hollow outline', () => {
  render(<Nav />)
  const general = screen.getByRole('button', { name: 'General' })
  const indicator = general.querySelector('.settings-nav-indicator')
  expect(indicator).not.toBeNull()
  expect(indicator?.className).toContain('bg-[linear-gradient')
  expect(indicator?.className).toContain('shadow-[inset_0_1px_0_')
  expect(indicator?.className).not.toMatch(/border-orbit-accent\/20/)
  expect(
    screen
      .getByRole('button', { name: 'Themes' })
      .querySelector('.settings-nav-indicator'),
  ).toBeNull()
})

it('moves the filled indicator when another section is selected', () => {
  render(<Nav />)
  fireEvent.click(screen.getByRole('button', { name: 'Themes' }))
  expect(
    screen
      .getByRole('button', { name: 'Themes' })
      .querySelector('.settings-nav-indicator'),
  ).not.toBeNull()
  expect(
    screen
      .getByRole('button', { name: 'General' })
      .querySelector('.settings-nav-indicator'),
  ).toBeNull()
})
