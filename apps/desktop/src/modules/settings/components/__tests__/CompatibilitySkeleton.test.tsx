import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import {
  CompatibilitySettingsSkeleton,
  ComponentRowsSkeleton,
} from '../CompatibilitySkeleton'

afterEach(cleanup)

it('mirrors the component rows with a picker and an Install button each', () => {
  render(<ComponentRowsSkeleton />)
  const loading = screen.getByRole('status', { name: 'Loading online versions' })
  const rows = within(loading).getAllByTestId('compatibility-skeleton-row')
  expect(rows).toHaveLength(5)
  // Icon, title, detail, picker and Install button.
  expect(rows[0].querySelectorAll('[data-skeleton]')).toHaveLength(5)
  expect(loading.textContent).toBe('')
})

it('mirrors the settings header and its three sections', () => {
  render(<CompatibilitySettingsSkeleton />)
  const loading = screen.getByRole('status', { name: 'Loading settings' })
  expect(loading.querySelectorAll('section')).toHaveLength(3)
  expect(within(loading).getAllByTestId('compatibility-skeleton-row')).toHaveLength(10)
  expect(loading.textContent).toBe('')
})
