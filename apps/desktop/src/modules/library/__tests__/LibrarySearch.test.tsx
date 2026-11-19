import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useUiStore } from '@/stores/ui.store'
import { LibraryPage } from '../LibraryPage'

vi.mock('@/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri')>()),
  listLibraryEntries: vi.fn(),
}))

import { listLibraryEntries } from '@/lib/tauri'

const list = vi.mocked(listLibraryEntries)
const searched = () =>
  list.mock.calls.map(([request]) => request.query ?? '').filter((query) => query !== '')

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue({ entries: [], total: 0, nextCursor: null } as never)
  useUiStore.setState({ searchQuery: '' })
  useUiStore.getState().setLibraryFilters({ query: '' })
})
afterEach(cleanup)

function renderPage(search: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <LibraryPage search={search} />
    </QueryClientProvider>,
  )
}

for (const [name, search] of [
  ['Search', true],
  ['Library', false],
] as const) {
  it(`${name} looks a title up once typing pauses, not on every key`, async () => {
    renderPage(search)
    const field = screen.getByRole('textbox', { name: 'Search your collection' })
    for (const text of ['z', 'ze', 'zel', 'zeld', 'zelda']) {
      fireEvent.change(field, { target: { value: text } })
    }
    // The field itself follows every key at once.
    expect(field).toHaveValue('zelda')
    expect(searched()).toEqual([])
    await waitFor(() => expect(searched()).toEqual(['zelda']))
    // Nothing more arrives for the keys in between.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(searched()).toEqual(['zelda'])
  })
}
