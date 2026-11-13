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
  await screen.findByRole('option', { name: /wine-10.0/ })
  expect(screen.getByLabelText('Compatibility runtime')).toHaveValue('/wine/bin/wine')
  fireEvent.change(screen.getByLabelText('Launch arguments (one per line)'), {
    target: { value: 'hello world\n$(literal)' },
  })
  expect(screen.getByRole('status').textContent).toContain(
    '"arguments":["hello world","$(literal)"]',
  )
  fireEvent.change(screen.getByLabelText('Game synchronization override'), {
    target: { value: 'msync' },
  })
  expect(screen.getByRole('status').textContent).toContain(
    '"compatibility":{"synchronization":"msync"}',
  )
})
