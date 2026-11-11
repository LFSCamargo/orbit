import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchGameArtwork, fetchArtworkFromUrl } from '@/lib/artworkApi'
import { useRandomArtwork } from '../useRandomArtwork'
vi.mock('@/lib/artworkApi', () => ({
  searchGameArtwork: vi.fn(),
  fetchArtworkFromUrl: vi.fn(),
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
const hit = (id: string) => ({
  id,
  title: 'Portal 2',
  source: 'SteamGridDB',
  imageUrl: `https://img/${id}.png`,
  previewUrl: `https://img/${id}.png`,
})
describe('random SteamGridDB artwork', () => {
  it('applies artwork to the requested draft slot and avoids repeating the previous image', async () => {
    vi.mocked(searchGameArtwork).mockResolvedValue({
      hits: [hit('1'), hit('2')],
      warnings: [],
    })
    vi.mocked(fetchArtworkFromUrl).mockImplementation(async (url) => `data:${url}`)
    const select = vi.fn()
    const { result } = renderHook(() => useRandomArtwork('game', 'Portal 2', select))
    await act(async () => result.current.randomize('icon'))
    const first = select.mock.calls[0]![1]
    await act(async () => result.current.randomize('icon'))
    expect(select.mock.calls[1]![1]).not.toBe(first)
    expect(select.mock.calls[1]![0]).toBe('icon')
    expect(searchGameArtwork).toHaveBeenCalledWith(
      'Portal 2',
      'icon',
      'game',
      'steamgriddb',
    )
  })
  it('reports missing keys without replacing the current image', async () => {
    vi.mocked(searchGameArtwork).mockResolvedValue({
      hits: [],
      warnings: ['Configure SteamGridDB in Settings'],
    })
    const select = vi.fn()
    const { result } = renderHook(() => useRandomArtwork('game', 'Portal 2', select))
    await act(async () => result.current.randomize('cover'))
    expect(result.current.error).toContain('Configure SteamGridDB')
    expect(select).not.toHaveBeenCalled()
  })
  it('does not apply a late image to another game', async () => {
    let finish!: (value: string) => void
    vi.mocked(searchGameArtwork).mockResolvedValue({ hits: [hit('1')], warnings: [] })
    vi.mocked(fetchArtworkFromUrl).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const select = vi.fn()
    const { result, rerender } = renderHook(
      ({ id }) => useRandomArtwork(id, 'Portal 2', select),
      { initialProps: { id: 'first' } },
    )
    let request!: Promise<void>
    act(() => {
      request = result.current.randomize('hero')
    })
    await waitFor(() => expect(fetchArtworkFromUrl).toHaveBeenCalled())
    rerender({ id: 'second' })
    await act(async () => {
      finish('data:image/png;base64,abc')
      await request
    })
    expect(select).not.toHaveBeenCalled()
  })
})
