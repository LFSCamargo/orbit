import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppUpdateSettings } from '../AppUpdateSettings'
import { useAppUpdateStore } from '@/stores/appUpdate.store'
import { appUpdateCheck, appUpdateRestart, openExternalUrl } from '@/lib/tauri'
import type { AppUpdateState } from '@/types/appUpdate'

vi.mock('@/lib/tauri', () => ({
  appVersion: vi.fn().mockResolvedValue('2.1.0'),
  appUpdateCheck: vi.fn(),
  appUpdateRestart: vi.fn(),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}))

const show = (state: AppUpdateState) => act(() => useAppUpdateStore.setState({ state }))

beforeEach(() => {
  vi.mocked(appUpdateCheck).mockResolvedValue({ status: 'upToDate', checkedAt: 'now' })
  vi.mocked(appUpdateRestart).mockResolvedValue(undefined)
  useAppUpdateStore.setState({ state: { status: 'idle' } })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('shows the running version and checks GitHub on request', async () => {
  render(<AppUpdateSettings order={0} />)
  expect(await screen.findByText(/Orbit 2\.1\.0/)).toBeTruthy()
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Check now' })),
  )
  expect(appUpdateCheck).toHaveBeenCalled()
  expect(useAppUpdateStore.getState().state.status).toBe('upToDate')
  expect(screen.getByText(/Orbit is up to date/)).toBeTruthy()
})

it('shows download progress, then restarts into a ready update', async () => {
  render(<AppUpdateSettings order={0} />)
  show({ status: 'downloading', version: '2.2.0', downloaded: 40, total: 100 })
  expect(screen.getByText(/Downloading Orbit 2\.2\.0 · 40%/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Check now' })).toBeDisabled()
  show({ status: 'ready', version: '2.2.0', notes: null })
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' })),
  )
  expect(appUpdateRestart).toHaveBeenCalled()
})

it('says why a restart was refused', async () => {
  vi.mocked(appUpdateRestart).mockRejectedValue('Finish your game first')
  render(<AppUpdateSettings order={0} />)
  show({ status: 'ready', version: '2.2.0', notes: null })
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' })),
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Finish your game first')
})

it('offers the GitHub download when this copy cannot update itself', async () => {
  render(<AppUpdateSettings order={0} />)
  show({
    status: 'unsupported',
    reason: 'Move Orbit to your Applications folder to get updates',
    releasesUrl: 'https://github.com/LFSCamargo/orbit/releases/latest',
  })
  expect(screen.getByText(/Applications folder/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Download from GitHub' }))
  expect(openExternalUrl).toHaveBeenCalledWith(
    'https://github.com/LFSCamargo/orbit/releases/latest',
  )
})
