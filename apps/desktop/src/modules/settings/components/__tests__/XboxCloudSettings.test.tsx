import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_APP_PREFERENCES, saveAppPreferences } from '@/lib/appPreferences'
import {
  openXboxCloud,
  xboxAccountStatus,
  xboxDevicePoll,
  xboxDeviceStart,
  xboxSignOut,
  xcloudStreamStatus,
} from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { XboxCloudSettings } from '../XboxCloudSettings'

vi.mock('@/lib/appPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/appPreferences')>()),
  saveAppPreferences: vi.fn(),
}))
vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  openXboxCloud: vi.fn(),
  xboxAccountStatus: vi.fn(),
  xboxDeviceStart: vi.fn(),
  xboxDevicePoll: vi.fn(),
  xboxDeviceCancel: vi.fn(),
  xboxSignOut: vi.fn(),
  xcloudStreamStatus: vi.fn(),
}))

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <XboxCloudSettings />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(saveAppPreferences).mockReset().mockResolvedValue(undefined)
  vi.mocked(openXboxCloud).mockReset().mockResolvedValue(undefined)
  vi.mocked(xboxAccountStatus).mockReset().mockResolvedValue(null)
  vi.mocked(xboxSignOut).mockReset().mockResolvedValue(undefined)
  vi.mocked(xcloudStreamStatus)
    .mockReset()
    .mockResolvedValue({
      market: 'BR',
      region: 'BrazilSouth',
      regions: ['BrazilSouth', 'EastUS'],
    })
  vi.mocked(xboxDeviceStart).mockReset().mockResolvedValue({
    userCode: 'ORBIT123',
    verificationUri: 'https://www.microsoft.com/link',
    intervalSeconds: 1,
    expiresInSeconds: 900,
  })
  vi.mocked(xboxDevicePoll).mockReset().mockResolvedValue({ done: false, account: null })
  usePreferencesStore.setState({
    ready: true,
    preferences: { ...DEFAULT_APP_PREFERENCES, onboardingCompleted: true },
  })
})

afterEach(cleanup)

it('shows a Microsoft device code and finishes when it is approved', async () => {
  vi.mocked(xboxDevicePoll).mockResolvedValue({
    done: true,
    account: { gamertag: 'Orbit Player', xuid: '1' },
  })
  renderSettings()
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
  expect(await screen.findByLabelText('Sign-in code')).toHaveTextContent('ORBIT123')
  expect(screen.getByText('microsoft.com/link')).toBeInTheDocument()
  vi.mocked(xboxAccountStatus).mockResolvedValue({ gamertag: 'Orbit Player', xuid: '1' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(await screen.findByText(/Signed in as Orbit Player/)).toBeInTheDocument()
})

it('offers a new code when sign-in fails', async () => {
  vi.mocked(xboxDevicePoll).mockRejectedValue(new Error('The code expired.'))
  renderSettings()
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The code expired.')
  fireEvent.click(screen.getByRole('button', { name: 'New code' }))
  await waitFor(() => expect(xboxDeviceStart).toHaveBeenCalledTimes(2))
})

it('asks for a fresh code every time it opens and on New code', async () => {
  vi.mocked(xboxDeviceStart)
    .mockResolvedValueOnce({
      userCode: 'FIRST111',
      verificationUri: 'https://www.microsoft.com/link',
      intervalSeconds: 5,
      expiresInSeconds: 900,
    })
    .mockResolvedValueOnce({
      userCode: 'SECOND22',
      verificationUri: 'https://www.microsoft.com/link',
      intervalSeconds: 5,
      expiresInSeconds: 900,
    })
    .mockResolvedValueOnce({
      userCode: 'THIRD333',
      verificationUri: 'https://www.microsoft.com/link',
      intervalSeconds: 5,
      expiresInSeconds: 900,
    })
  renderSettings()
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
  expect(await screen.findByLabelText('Sign-in code')).toHaveTextContent('FIRST111')
  fireEvent.click(screen.getByRole('button', { name: 'New code' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Sign-in code')).toHaveTextContent('SECOND22'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() =>
    expect(screen.getByLabelText('Sign-in code')).toHaveTextContent('THIRD333'),
  )
})

it('signs out of a linked account', async () => {
  vi.mocked(xboxAccountStatus).mockResolvedValue({ gamertag: 'Orbit Player', xuid: '1' })
  renderSettings()
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
  await waitFor(() => expect(xboxSignOut).toHaveBeenCalled())
})

it('opens Xbox Cloud Gaming and remembers it for the Home menu', async () => {
  renderSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Open Xbox Cloud Gaming' }))
  await waitFor(() =>
    expect(usePreferencesStore.getState().preferences.xboxCloudConnected).toBe(true),
  )
  expect(openXboxCloud).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Remove from Orbit' })).toBeInTheDocument()
})

it('shows when the window cannot open', async () => {
  vi.mocked(openXboxCloud).mockRejectedValue(new Error('no webview'))
  renderSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Open Xbox Cloud Gaming' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/could not open/i)
  expect(usePreferencesStore.getState().preferences.xboxCloudConnected).toBe(false)
})

it('shows that the linked account can stream in Orbit, and where', async () => {
  vi.mocked(xboxAccountStatus).mockResolvedValue({ gamertag: 'Orbit Player', xuid: '1' })
  renderSettings()
  expect(
    await screen.findByText(/Cloud streaming ready · BrazilSouth \(BR\)/),
  ).toBeTruthy()
})

it('explains when the linked account cannot stream yet', async () => {
  vi.mocked(xboxAccountStatus).mockResolvedValue({ gamertag: 'Orbit Player', xuid: '1' })
  vi.mocked(xcloudStreamStatus).mockRejectedValue(
    new Error('Xbox Cloud Gaming is not available for this account or country'),
  )
  renderSettings()
  expect(
    await screen.findByText(/not available for this account or country/),
  ).toBeTruthy()
})
