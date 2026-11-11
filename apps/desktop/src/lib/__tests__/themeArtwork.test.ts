import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bundledThemeBranding, loadThemeBranding } from '../themeArtwork'
import { bundledThemeArtwork, searchThemeArtwork, fetchThemeArtwork } from '../tauri'
vi.mock('../tauri', () => ({
  bundledThemeArtwork: vi.fn(),
  searchThemeArtwork: vi.fn(),
  fetchThemeArtwork: vi.fn(),
}))
vi.mock('../media', () => ({
  mediaSrc: (path: string | null) => (path ? `asset://localhost/${path}` : undefined),
}))
const hit = {
  id: 'x',
  title: 'Portal 2',
  previewUrl: 'preview',
  imageUrl: 'image',
  source: 'SteamGridDB',
  width: 1920,
  height: 1080,
}
beforeEach(() => vi.resetAllMocks())
describe('theme artwork', () => {
  it('downloads the first available logo and hero', async () => {
    vi.mocked(searchThemeArtwork).mockImplementation(async (_query, slot) => [
      { ...hit, imageUrl: slot },
    ])
    vi.mocked(fetchThemeArtwork).mockImplementation(async (url) => `data:${url}`)
    expect(await loadThemeBranding('Portal 2')).toEqual({
      artworkQuery: 'Portal 2',
      logoImage: 'data:logo',
      wallpaper: 'data:hero',
    })
    expect(fetchThemeArtwork).toHaveBeenCalledWith('hero', 'hero')
  })
  it('does not substitute a text logo when no logo exists', async () => {
    vi.mocked(searchThemeArtwork).mockResolvedValue([])
    await expect(loadThemeBranding('Portal 2')).rejects.toThrow('No SteamGridDB logo')
  })
  it('errors when no hero is found', async () => {
    vi.mocked(searchThemeArtwork).mockImplementation(async (_query, slot) =>
      slot === 'logo' ? [hit] : [],
    )
    await expect(loadThemeBranding('Portal 2')).rejects.toThrow('No SteamGridDB hero')
    expect(fetchThemeArtwork).not.toHaveBeenCalled()
  })
})

it('converts bundled filesystem paths for native wallpaper and logo rendering', async () => {
  vi.mocked(bundledThemeArtwork).mockImplementation(
    async (_id, slot) => `bundle/${slot}.png`,
  )
  expect(await bundledThemeBranding('native-fixture')).toEqual({
    logoImage: 'asset://localhost/bundle/logo.png',
    wallpaper: 'asset://localhost/bundle/hero.png',
  })
})

it('uses the same packaged artwork as theme cards before querying native resources', async () => {
  vi.mocked(bundledThemeArtwork).mockRejectedValue(
    new Error('No native resource directory'),
  )
  const branding = await bundledThemeBranding('cyberpunk-2077')
  expect(branding?.logoImage).toMatch(/cyberpunk-2077\/logo\.webp/)
  expect(branding?.wallpaper).toMatch(/cyberpunk-2077\/hero\.webp/)
  expect(bundledThemeArtwork).not.toHaveBeenCalled()
})
