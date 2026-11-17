import { afterEach, expect, it, vi } from 'vitest'
import { normalizeArtwork } from '../artworkApi'

const cacheArtworkFromUrl = vi.fn()
vi.mock('@/lib/tauri', () => ({
  cacheArtworkFromUrl: (...args: unknown[]) => cacheArtworkFromUrl(...args),
}))
vi.mock('@/lib/devMockApi', () => ({ isTauriRuntime: () => false, mockInvoke: vi.fn() }))

afterEach(() => cacheArtworkFromUrl.mockReset())

const missingLogo = 'https://cdn.akamai.steamstatic.com/steam/apps/312990/logo.png'
const saved = {
  cover: 'orbit-artwork://g1/cover.png',
  hero: 'orbit-artwork://g1/hero.png',
  icon: 'orbit-artwork://g1/icon.png',
  logo: missingLogo,
}

it('keeps artwork that was not changed instead of downloading it again', async () => {
  // Regression: saving The Expendabros re-downloaded its Steam logo.png, a
  // 404, and every save failed with "Failed to download (HTTP 404 Not Found)".
  cacheArtworkFromUrl.mockImplementation(
    async (url: string, _id: string, slot: string) => {
      if (url === missingLogo) throw 'Failed to download (HTTP 404 Not Found)'
      return `orbit-artwork://g1/${slot}-new.png`
    },
  )
  const artwork = await normalizeArtwork(
    'g1',
    { ...saved, hero: 'https://cdn2.steamgriddb.com/hero/new.png' },
    saved,
  )
  expect(artwork).toEqual({ ...saved, hero: 'orbit-artwork://g1/hero-new.png' })
  expect(cacheArtworkFromUrl).toHaveBeenCalledTimes(1)
})

it('names the image that could not be downloaded', async () => {
  cacheArtworkFromUrl.mockRejectedValue('Failed to download (HTTP 404 Not Found)')
  await expect(
    normalizeArtwork('g1', { ...saved, hero: 'https://example.com/gone.png' }, saved),
  ).rejects.toThrow(
    'The landscape hero image couldn’t be downloaded (HTTP 404 Not Found).',
  )
})
