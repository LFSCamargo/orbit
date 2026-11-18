import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { uninstallSummary } from '@/components/game/UninstallDialog'
import { UninstallAction } from '../UninstallAction'

vi.mock('@/lib/tauri', () => ({
  uninstallSteamGame: vi
    .fn()
    .mockResolvedValue({ removedBytes: 2_147_483_648, keptPrefix: false }),
}))
import { uninstallSteamGame } from '@/lib/tauri'
vi.mock('@/lib/toast', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))
import { notify } from '@/lib/toast'

afterEach(cleanup)

function renderAction() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UninstallAction appId="570" title="Dota 2" sizeBytes={2_147_483_648} order={4} />
    </QueryClientProvider>,
  )
}

it('keeps saves unless the person opts in, then reports the space freed', async () => {
  renderAction()
  fireEvent.click(screen.getByRole('button', { name: /Uninstall/ }))
  expect(screen.getByText('Uninstall Dota 2?')).toBeTruthy()
  const saves = screen.getByRole('switch', { name: /Also delete saves/ })
  expect(saves).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
  await waitFor(() => expect(uninstallSteamGame).toHaveBeenCalledWith('570', false))
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith({
      title: 'Uninstalled',
      message: 'Uninstalled Dota 2 and freed 2.0 GB.',
    }),
  )
})

it('passes the saves choice through', async () => {
  renderAction()
  fireEvent.click(screen.getByRole('button', { name: /Uninstall/ }))
  fireEvent.click(screen.getByRole('switch', { name: /Also delete saves/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }))
  await waitFor(() => expect(uninstallSteamGame).toHaveBeenLastCalledWith('570', true))
})

it('explains when saves had to be kept', () => {
  expect(uninstallSummary('Dota 2', { removedBytes: 0, keptPrefix: true })).toBe(
    'Uninstalled Dota 2. Saves were kept because this game’s folder holds a Steam sign-in.',
  )
})
