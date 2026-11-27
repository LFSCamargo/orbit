import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DownloadTask } from '@/lib/downloadProgress'
import { DownloadRow } from '../DownloadRow'

vi.mock('../DownloadArtwork', () => ({ DownloadArtwork: () => null }))
vi.mock('@/hooks/useNow', () => ({ useNow: () => Date.parse('2026-11-26T12:10:00Z') }))

afterEach(cleanup)

const base: DownloadTask = {
  key: 'steam:2322010',
  label: 'God of War Ragnarök',
  startedAt: '2026-11-26T12:00:00Z',
  progress: null,
}

it('reads a large download like Steam: amount, exact percent, speed, time left and disk', () => {
  render(
    <DownloadRow
      task={{
        ...base,
        rate: 50_000_000,
        history: [20_000_000, 45_000_000, 50_000_000],
        peak: 58_300_000,
        progress: {
          phase: 'Downloading',
          component: 'God of War Ragnarök',
          downloadedBytes: 3_650_676_672,
          totalBytes: 107_638_559_248,
          stagedBytes: 3_727_145_118,
          stageTotalBytes: 188_876_500_360,
        },
      }}
      appId="2322010"
      order={0}
    />,
  )
  expect(screen.getByText('Downloading')).toBeTruthy()
  expect(screen.getByText(/3\.7 GB of 107\.6 GB/)).toBeTruthy()
  expect(screen.getByText('3.3%')).toBeTruthy()
  expect(screen.getByTestId('download-rate')).toHaveTextContent('50.0 MB/s')
  expect(screen.getByTestId('download-timing')).toHaveTextContent(
    '34m left · On disk 3.7 GB of 188.9 GB · Elapsed 10:00',
  )
  expect(screen.getByTestId('download-speed-graph')).toHaveTextContent('Peak 58.3 MB/s')
  expect(screen.getByRole('list', { name: 'Step 5 of 7: Downloading' })).toBeTruthy()
})

it('shows real progress before bytes flow instead of a spinner', () => {
  // A resumed download reports its saved position while Steam starts.
  render(
    <DownloadRow
      task={{
        ...base,
        progress: {
          phase: 'Installing',
          component: 'God of War Ragnarök',
          message: 'Starting download',
          downloadedBytes: 3_650_676_672,
          totalBytes: 107_638_559_248,
        },
      }}
      appId="2322010"
      order={0}
    />,
  )
  const bar = screen.getByRole('progressbar', { name: 'God of War Ragnarök progress' })
  expect(bar).not.toHaveAttribute('data-indeterminate')
  expect(screen.getByText('Starting download')).toBeTruthy()
  expect(
    screen.getByRole('list', { name: 'Step 3 of 7: Starting download' }),
  ).toBeTruthy()
  const states = screen.getByTestId('download-step-track').querySelectorAll('li')
  expect([...states].map((step) => step.dataset.state)).toEqual([
    'done',
    'done',
    'current',
    'todo',
    'todo',
    'todo',
    'todo',
  ])
  expect(screen.queryByTestId('download-speed-graph')).toBeNull()
  // The current setup step reads as underway, not as the download's percent.
  const current = screen
    .getByTestId('download-step-track')
    .querySelector('[data-state="current"] span') as HTMLElement
  expect(current.style.width).toBe('50%')
})

it('marks a finished download as installed without timing or steps', () => {
  render(
    <DownloadRow
      task={{
        ...base,
        progress: {
          phase: 'Ready',
          component: 'God of War Ragnarök',
          message: 'Installed',
        },
      }}
      appId="2322010"
      order={0}
      onDismiss={() => {}}
    />,
  )
  expect(screen.getByText('Installed')).toBeTruthy()
  expect(screen.getByText('100%')).toBeTruthy()
  expect(screen.queryByTestId('download-timing')).toBeNull()
  expect(screen.queryByTestId('download-step-track')).toBeNull()
})
