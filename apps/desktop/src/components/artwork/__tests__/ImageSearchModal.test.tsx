import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageSearchModal } from '../ImageSearchModal'
import { searchGameArtwork, fetchArtworkFromUrl } from '@/lib/artworkApi'
vi.mock('@/lib/artworkApi', () => ({
  searchGameArtwork: vi.fn(),
  fetchArtworkFromUrl: vi.fn(),
}))
vi.mock('@/hooks/useModalFocus', () => ({ useModalFocus: vi.fn() }))
HTMLElement.prototype.scrollIntoView = vi.fn()
const hits = [
  {
    id: '1',
    title: 'Portal 2',
    source: 'SteamGridDB',
    previewUrl: 'https://img/a.png',
    imageUrl: 'https://img/a.png',
  },
  {
    id: '2',
    title: 'Portal 2',
    source: 'RAWG',
    previewUrl: 'https://img/b.png',
    imageUrl: 'https://img/b.png',
  },
]
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
describe('artwork grid', () => {
  it('searches automatically for the selected slot and filters all available sources', async () => {
    vi.mocked(searchGameArtwork).mockResolvedValue({
      hits,
      warnings: ['TheGamesDB is unavailable'],
    })
    const select = vi.fn()
    const close = vi.fn()
    vi.mocked(fetchArtworkFromUrl).mockResolvedValue('data:image/png;base64,abc')
    render(
      <ImageSearchModal
        open
        initialQuery="Portal 2"
        slot="hero"
        gameId="game"
        onSelect={select}
        onClose={close}
      />,
    )
    await screen.findByRole('button', { name: 'Portal 2 — RAWG' })
    expect(searchGameArtwork).toHaveBeenCalledWith('Portal 2', 'hero', 'game')
    expect(screen.getByText('TheGamesDB is unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'SteamGridDB (1)' }))
    expect(
      screen.queryByRole('button', { name: 'Portal 2 — RAWG' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Portal 2 — SteamGridDB' }))
    await waitFor(() => expect(select).toHaveBeenCalledWith('data:image/png;base64,abc'))
    expect(close).toHaveBeenCalledOnce()
  })
  it('keeps the picker open and current artwork intact on download failure', async () => {
    vi.mocked(searchGameArtwork).mockResolvedValue({ hits, warnings: [] })
    vi.mocked(fetchArtworkFromUrl).mockRejectedValue(new Error('Download unavailable'))
    const select = vi.fn()
    const close = vi.fn()
    render(
      <ImageSearchModal open initialQuery="Portal 2" onSelect={select} onClose={close} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Portal 2 — RAWG' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Download unavailable')
    expect(select).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })
  it('discards late responses after the game or slot changes', async () => {
    let resolveOld!: (value: { hits: typeof hits; warnings: string[] }) => void
    vi.mocked(searchGameArtwork)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOld = resolve
        }),
      )
      .mockResolvedValue({ hits: [], warnings: [] })
    const props = { open: true, onSelect: vi.fn(), onClose: vi.fn() }
    const { rerender } = render(
      <ImageSearchModal {...props} initialQuery="Old" slot="cover" />,
    )
    rerender(<ImageSearchModal {...props} initialQuery="New" slot="icon" />)
    await waitFor(() =>
      expect(searchGameArtwork).toHaveBeenLastCalledWith('New', 'icon', undefined),
    )
    await act(async () => resolveOld({ hits, warnings: [] }))
    expect(
      screen.queryByRole('button', { name: 'Portal 2 — RAWG' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Game title to search' })).toHaveValue(
      'New',
    )
  })
})
