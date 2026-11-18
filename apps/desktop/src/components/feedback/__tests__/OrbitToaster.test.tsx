import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { notify } from '@/lib/toast'
import { OrbitToaster } from '../OrbitToaster'

afterEach(() => {
  act(() => {
    notify.dismiss()
  })
  cleanup()
})

it('shows success, warning and error toasts with title and message', async () => {
  render(<OrbitToaster />)
  act(() => {
    notify.success({ title: 'Installed', message: 'The Expendabros is ready to play.' })
    notify.warning({ title: 'Saves kept', message: 'The folder holds a Steam sign-in.' })
    notify.error({ title: 'Download failed', message: 'Steam refused the login.' })
  })
  expect(await screen.findByText('Installed')).toBeTruthy()
  expect(screen.getByText('The Expendabros is ready to play.')).toBeTruthy()
  expect(screen.getByTestId('toast-success')).toBeTruthy()
  expect(screen.getByTestId('toast-warning')).toBeTruthy()
  expect(screen.getByTestId('toast-error')).toHaveAttribute('role', 'alert')
})

it('updates one progress toast in place and turns a loader into a result', async () => {
  render(<OrbitToaster />)
  act(() => {
    notify.progress({
      id: 'steam:312990',
      title: 'The Expendabros',
      caption: 'Step 4 of 6 · Downloading',
      message: '12.3 MB/s · 16 MB / 129 MB',
      value: 10,
    })
  })
  expect(await screen.findByText('Step 4 of 6 · Downloading')).toBeTruthy()
  expect(screen.getByText('12.3 MB/s · 16 MB / 129 MB')).toBeTruthy()
  expect(
    await screen.findByRole('progressbar', { name: 'The Expendabros' }),
  ).toHaveAttribute('aria-valuenow', '10')
  act(() => {
    notify.progress({
      id: 'steam:312990',
      title: 'The Expendabros',
      message: 'Downloading',
      value: 55,
    })
  })
  expect(
    await screen.findByRole('progressbar', { name: 'The Expendabros' }),
  ).toHaveAttribute('aria-valuenow', '55')
  expect(screen.getAllByRole('progressbar')).toHaveLength(1)

  let id: string | number = ''
  act(() => {
    id = notify.loading({ title: 'Scanning storage', message: 'Measuring game folders' })
  })
  expect(await screen.findByTestId('toast-loading')).toBeTruthy()
  act(() => {
    notify.success({ title: 'Storage scanned' }, { id })
  })
  expect(await screen.findByText('Storage scanned')).toBeTruthy()
  expect(screen.queryByTestId('toast-loading')).toBeNull()
})

it('can be dismissed', async () => {
  render(<OrbitToaster />)
  act(() => {
    notify.error({ title: 'Uninstall failed' })
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Dismiss notification' }))
  await waitFor(() => expect(screen.queryByText('Uninstall failed')).toBeNull(), {
    timeout: 2_000,
  })
})
