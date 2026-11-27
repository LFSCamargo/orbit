import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { CompressionStatus } from '@/types/compression'
import { compressionSummary, GameCompressionSetting } from '../GameCompressionSetting'

const idle: CompressionStatus = {
  enabled: false,
  running: false,
  compressing: false,
  gamesDone: 0,
  gamesTotal: 0,
  currentTitle: null,
  bytesDone: 0,
  bytesTotal: 0,
  savedBytes: 0,
  skippedGames: 0,
  error: null,
}

vi.mock('@/lib/tauri', () => ({
  getGameCompression: vi.fn(),
  setGameCompression: vi.fn(),
}))
import { getGameCompression, setGameCompression } from '@/lib/tauri'
vi.mock('@/lib/toast', () => ({ notify: { error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderSetting(status: CompressionStatus) {
  vi.mocked(getGameCompression).mockResolvedValue(status)
  vi.mocked(setGameCompression).mockImplementation(async (enabled) => ({
    ...status,
    enabled,
    running: true,
    compressing: enabled,
  }))
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GameCompressionSetting />
    </QueryClientProvider>,
  )
}

it('asks before compressing every game, then starts the job', async () => {
  renderSetting(idle)
  const toggle = await screen.findByRole('switch', { name: 'Compress games' })
  await waitFor(() => expect(toggle).not.toBeDisabled())
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  expect(screen.getByText('Compress your games?')).toBeTruthy()
  expect(setGameCompression).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Compress games' }))
  await waitFor(() => expect(setGameCompression).toHaveBeenCalledWith(true))
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: 'Compress games' })).toHaveAttribute(
      'aria-checked',
      'true',
    ),
  )
})

it('cancelling the confirmation changes nothing', async () => {
  renderSetting({ ...idle, enabled: true })
  const toggle = await screen.findByRole('switch', { name: 'Compress games' })
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  fireEvent.click(toggle)
  expect(screen.getByText('Decompress your games?')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(setGameCompression).not.toHaveBeenCalled()
})

it('turning it off decompresses every game after confirming', async () => {
  renderSetting({ ...idle, enabled: true })
  const toggle = await screen.findByRole('switch', { name: 'Compress games' })
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Decompress games' }))
  await waitFor(() => expect(setGameCompression).toHaveBeenCalledWith(false))
})

it('summarises the state under the switch', () => {
  expect(compressionSummary(undefined)).toBe('Checking…')
  expect(compressionSummary(idle)).toBe('Off. Games are stored at full size.')
  expect(compressionSummary({ ...idle, enabled: true, savedBytes: 2_147_483_648 })).toBe(
    'On. Saved 2.0 GB in the last pass.',
  )
  expect(
    compressionSummary({ ...idle, enabled: true, running: true, compressing: true }),
  ).toBe('Compressing your games…')
})
