import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WineProfileEditor } from '../WineProfileEditor'
import { useState } from 'react'
import type { WineProfile } from '@/types/runtime'
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
  fireEvent.keyDown(screen.getByLabelText('Game synchronization override'), {
    key: 'ArrowDown',
  })
  fireEvent.click(await screen.findByRole('option', { name: 'MSync' }))
  expect(screen.getByRole('status').textContent).toContain(
    '"compatibility":{"synchronization":"msync"}',
  )
})
