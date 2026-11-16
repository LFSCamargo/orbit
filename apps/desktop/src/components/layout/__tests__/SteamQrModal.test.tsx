import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { SteamQrModal } from '../SteamQrModal'
import { useUiStore } from '@/stores/ui.store'

const api = vi.hoisted(() => ({
  open: vi.fn(),
  place: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('@/lib/tauri', () => ({
  openSteamWindowsLogin: api.open,
  placeSteamWindowsLogin: api.place,
  pollSteamWindowsLogin: api.poll,
  cancelSteamWindowsSignIn: api.cancel,
}))
vi.mock('@/hooks/useModalFocus', () => ({ useModalFocus: vi.fn() }))

function show(onClose = vi.fn()) {
  api.open.mockResolvedValue(undefined)
  api.poll.mockResolvedValue({ done: false, status: null })
  api.cancel.mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <SteamQrModal open attempt={1} onSignedIn={vi.fn()} onClose={onClose} />
      </QueryClientProvider>,
    ),
  }
}
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  useUiStore.getState().setImportToast(null)
})

it('keeps the modal loading until the native window is placed over its host', async () => {
  let placed: (value: { placed: boolean }) => void = () => {}
  api.place.mockImplementation(
    () =>
      new Promise((resolve) => {
        placed = resolve
      }),
  )
  show()
  await waitFor(() => expect(api.place).toHaveBeenCalled())
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status', { name: 'Loading Steam sign-in' })).toBeVisible()
  expect(screen.queryByText(/Scan the QR/)).toBeNull()
  await act(async () => placed({ placed: true }))
  expect(await screen.findByText(/Scan the QR/)).toBeVisible()
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'false')
})

it('reports placement errors instead of showing an empty ready form', async () => {
  api.place.mockRejectedValue(new Error('Allow Accessibility access to position Steam'))
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent('Accessibility')
  expect(screen.queryByText(/Scan the QR/)).toBeNull()
})

it('keeps the modal open until its native Steam window has closed', async () => {
  api.place.mockResolvedValue({ placed: true })
  let complete: () => void = () => {}
  const view = show()
  api.cancel.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(view.onClose).not.toHaveBeenCalled()
  await waitFor(() => expect(api.cancel).toHaveBeenCalledOnce())
  await act(async () => complete())
  await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce())
})

it('waits for a pending native open before cancelling so Steam cannot appear after dismissal', async () => {
  let opened: () => void = () => {}
  api.place.mockResolvedValue({ placed: true })
  const view = show()
  // The open function is already running; make its result awaitable from the close flow.
  cleanup()
  api.open.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        opened = resolve
      }),
  )
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <SteamQrModal open attempt={2} onSignedIn={vi.fn()} onClose={view.onClose} />
    </QueryClientProvider>,
  )
  await waitFor(() => expect(api.open).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(api.cancel).not.toHaveBeenCalled()
  await act(async () => opened())
  await waitFor(() => expect(api.cancel).toHaveBeenCalledOnce())
  await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce())
})

it('dismisses Cancel and reports cleanup errors outside the modal', async () => {
  api.place.mockResolvedValue({ placed: true })
  const view = show()
  api.cancel.mockRejectedValue(new Error("Steam's sign-in window could not be closed"))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce())
  expect(useUiStore.getState().importToast).toBe(
    "Steam's sign-in window could not be closed",
  )
})
