import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { GeneralPreferences } from '../GeneralPreferences'

afterEach(cleanup)

it('keeps Orbit application updates manual while preserving runtime updates', () => {
  render(<GeneralPreferences />)
  expect(
    screen.queryByRole('switch', { name: 'Update Orbit automatically' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Orbit updates' })).not.toBeInTheDocument()
  expect(
    screen.getByRole('switch', { name: 'Update runtimes automatically' }),
  ).toBeInTheDocument()
})
