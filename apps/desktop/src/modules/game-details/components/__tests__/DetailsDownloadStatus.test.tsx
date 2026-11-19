import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useDownloadStore } from '@/lib/downloadProgress'
import type { LibraryEntry } from '@/types/library'
import { DetailsDownloadStatus } from '../DetailsDownloadStatus'

vi.mock('@/lib/tauri', () => ({
  getDownloadQueue: vi.fn(async () => ({ active: null, pending: [] })),
}))

afterEach(() => {
  cleanup()
  useDownloadStore.setState({ tasks: {}, failures: {} })
})

const entry = {
  id: 'steam:312990',
  steamAppId: '312990',
  game: { title: 'The Expendabros' },
} as unknown as LibraryEntry

function renderStatus() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DetailsDownloadStatus entry={entry} />
    </QueryClientProvider>,
  )
}

it('stays hidden when the game is not downloading', () => {
  renderStatus()
  expect(screen.queryByTestId('details-download-status')).toBeNull()
})

it('shows bytes and a live bar while Steam downloads the game', () => {
  useDownloadStore.setState({
    tasks: {
      'steam:312990': {
        key: 'steam:312990',
        label: 'The Expendabros',
        startedAt: '2026-11-17T00:00:00Z',
        progress: {
          phase: 'Downloading',
          component: 'The Expendabros',
          downloadedBytes: 32_000_000,
          totalBytes: 128_000_000,
        },
      },
    },
    failures: {},
  })
  renderStatus()
  expect(screen.getByText('5/7 · Downloading')).toBeTruthy()
  expect(screen.getByText('32.0 MB / 128.0 MB')).toBeTruthy()
  expect(screen.getByText('25%')).toBeTruthy()
  expect(
    screen.getByRole('progressbar', { name: 'The Expendabros progress' }),
  ).toHaveAttribute('aria-valuenow', '25')
})
