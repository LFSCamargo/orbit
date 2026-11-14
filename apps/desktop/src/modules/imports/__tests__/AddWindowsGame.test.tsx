import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { AddGamePage } from '../AddGamePage'
const create = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'new-game' }))
vi.mock('@/hooks/useGames', () => ({
  useGameActions: () => ({ create: { mutateAsync: create } }),
}))
vi.mock('@/lib/dialog', () => ({ open: vi.fn().mockResolvedValue('/Games/Example.exe') }))
vi.mock('@/lib/tauri', () => ({
  detectRuntimes: vi
    .fn()
    .mockResolvedValue([
      { path: '/wine/bin/wine', serverPath: '/wine/bin/wineserver', version: 'wine-10' },
    ]),
  getComponentStatus: vi.fn().mockResolvedValue([]),
}))
vi.mock('../hooks/useImportScan', () => ({ useImportScan: () => ({ runScan: vi.fn() }) }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('Single file → choose .exe → Add stores a Wine profile, never a GameHub shortcut', async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddGamePage />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /Single file/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Choose file' }))
  const save = await screen.findByRole('button', { name: 'Add to library' })
  await waitFor(() => expect(save).toBeEnabled())
  fireEvent.click(save)
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'manual',
        platform: 'windows',
        launchConfig: {
          type: 'wine',
          profile: {
            executable: '/Games/Example.exe',
            runtimePath: '/wine/bin/wine',
            arguments: [],
            environment: {},
          },
        },
      }),
    ),
  )
  expect(await screen.findByText('All set')).toBeInTheDocument()
})
