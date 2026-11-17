import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { SteamQrModal } from '../SteamQrModal'
import { useUiStore } from '@/stores/ui.store'

import type { SteamQrPoll } from '@/types/steam'

const api = vi.hoisted(() => ({
  start: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@/lib/tauri', () => ({
  startSteamWindowsQr: api.start,
  pollSteamWindowsQr: api.poll,
  cancelSteamWindowsSignIn: api.cancel,
}))
vi.mock('@/hooks/useModalFocus', () => ({ useModalFocus: vi.fn() }))

function show({
  onClose = vi.fn(),
  onSignedIn = vi.fn(),
  start,
  poll,
}: {
  onClose?: () => void
  onSignedIn?: (result: SteamQrPoll) => void
  start?: () => Promise<unknown>
  poll?: () => Promise<unknown>
} = {}) {
  api.start.mockImplementation(
    start ??
      (async () => ({
        qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        clientId: '1',
        requestId: 'abc',
        intervalSeconds: 5,
      })),
  )
  api.poll.mockImplementation(
    poll ?? (async () => ({ done: false, status: null, libraryError: null })),
  )
  api.cancel.mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onClose,
    onSignedIn,
    ...render(
      <QueryClientProvider client={client}>
        <SteamQrModal open attempt={1} onSignedIn={onSignedIn} onClose={onClose} />
      </QueryClientProvider>,
    ),
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  useUiStore.getState().setImportToast(null)
})

it('shows an Orbit QR code instead of opening a Steam window', async () => {
  show()
  const image = await screen.findByRole('img', { name: 'Steam sign-in QR code' })
  expect(image).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'))
  expect(screen.getByText('Scan this QR code with the Steam mobile app.')).toBeVisible()
  expect(api.start).toHaveBeenCalledOnce()
  expect(screen.queryByText(/does not open the Steam window/)).toBeNull()
})

it('finishes when the Rust client confirms the login', async () => {
  const onSignedIn = vi.fn()
  show({
    onSignedIn,
    poll: async () => ({
      done: true,
      status: { signedIn: true, accountName: 'orbit_player' },
      libraryError: null,
    }),
  })
  await waitFor(() =>
    expect(onSignedIn).toHaveBeenCalledWith(
      expect.objectContaining({
        done: true,
        status: expect.objectContaining({ signedIn: true }),
      }),
    ),
  )
})

it('cancels the in-app sign-in', async () => {
  const view = show()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(api.cancel).toHaveBeenCalledOnce())
  await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce())
})

it('reports a failed QR start in the dialog', async () => {
  show({
    start: async () => {
      throw new Error('Steam sign-in could not start')
    },
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Steam sign-in could not start',
  )
})

it('dismisses Cancel and reports cleanup errors outside the modal', async () => {
  const view = show()
  api.cancel.mockRejectedValue(new Error("Steam's sign-in could not be cancelled"))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce())
  expect(useUiStore.getState().importToast).toBe("Steam's sign-in could not be cancelled")
})
