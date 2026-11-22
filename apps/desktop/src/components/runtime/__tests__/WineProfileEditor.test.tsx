import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WineProfileEditor } from '../WineProfileEditor'
import { useState } from 'react'
import type { WineProfile } from '@/types/runtime'
import { getComponentStatus } from '@/lib/tauri'
vi.mock('@/lib/tauri', () => ({
  getComponentStatus: vi.fn().mockResolvedValue([]),
  detectRuntimes: vi.fn().mockResolvedValue([
    {
      path: '/wine/bin/wine',
      serverPath: '/wine/bin/wineserver',
      version: 'wine-10.0',
    },
  ]),
}))
afterEach(cleanup)
it('selects a detected runtime and preserves arguments as individual values', async () => {
  vi.mocked(getComponentStatus).mockResolvedValue([
    {
      id: 'dxmt',
      version: 'v0.80',
      kind: 'dxmt',
      path: '/components/dxmt',
      installedAt: '2026-11-22T00:00:00Z',
    },
    {
      id: 'gptk',
      version: '4',
      kind: 'gptk',
      path: '/components/gptk',
      installedAt: '2026-11-22T00:00:00Z',
    },
  ])
  function Editor() {
    const [profile, setProfile] = useState<WineProfile>({
      executable: '/games/demo.exe',
      runtimePath: '',
      arguments: [],
      environment: {},
    })
    return (
      <>
        <WineProfileEditor value={profile} onChange={setProfile} />
        <output>{JSON.stringify(profile)}</output>
      </>
    )
  }
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Editor />
    </QueryClientProvider>,
  )
  expect(await screen.findByText(/wine-10.0/)).toBeTruthy()
  expect(screen.getByLabelText('Compatibility runtime')).toHaveTextContent('wine-10.0')
  fireEvent.click(screen.getByRole('button', { name: 'Advanced launch options' }))
  fireEvent.change(screen.getByLabelText('Launch arguments (one per line)'), {
    target: { value: 'hello world\n$(literal)' },
  })
  expect(screen.getByRole('status').textContent).toContain(
    '"arguments":["hello world","$(literal)"]',
  )
  expect(screen.queryByLabelText('Game display override')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('High Resolution Mode override')).not.toBeInTheDocument()
  expect(screen.getByText(/Display is fixed at 1920 × 1080/)).toBeInTheDocument()
  fireEvent.keyDown(screen.getByLabelText('Game synchronization override'), {
    key: 'ArrowDown',
  })
  fireEvent.click(await screen.findByRole('option', { name: 'MSync' }))
  expect(screen.getByRole('status').textContent).toContain(
    '"compatibility":{"synchronization":"msync"}',
  )
  fireEvent.change(screen.getByLabelText('Game frame rate limit override'), {
    target: { value: '60' },
  })
  expect(screen.getByRole('status').textContent).toContain('"frameRateLimit":60')
  expect(screen.getByRole('status').textContent).toContain('"graphics":"d3dmetal"')
  fireEvent.keyDown(screen.getByLabelText('D3DMetal DLSS support override'), {
    key: 'ArrowDown',
  })
  fireEvent.click(await screen.findByRole('option', { name: 'On' }))
  expect(screen.getByRole('status').textContent).toContain('"graphics":"d3dmetal"')
  expect(screen.getByRole('status').textContent).toContain('"upscaling":true')
  expect(screen.getByRole('status').textContent).toContain('"frameRateLimit":60')
  expect(screen.getByRole('status').textContent).toContain('"dxmtNvidiaExtensions":false')
  expect(screen.getByLabelText('DXMT spatial upscaling override')).toHaveTextContent(
    'Off',
  )
  expect(screen.getByLabelText('DXMT spatial upscaling override')).toBeDisabled()
  expect(screen.getByLabelText('DXMT NVIDIA extensions override')).toBeDisabled()
})
