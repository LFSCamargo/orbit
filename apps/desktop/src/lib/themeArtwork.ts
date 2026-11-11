import { searchGameArtwork } from '@/lib/artworkApi'
import { fetchThemeArtwork, searchThemeArtwork, bundledThemeArtwork } from '@/lib/tauri'
import { localThemeArtwork } from '@/lib/bundledArtwork'
import { mediaSrc } from '@/lib/media'
import type { ThemeBranding } from '@/themes/types'

/** Load the first available SteamGridDB logo and hero for a game theme.
 *  Built-in themes first try artwork bundled with the app binary; if that is
 *  missing we fall back to a SteamGridDB download. */
export async function loadThemeBranding(query: string): Promise<ThemeBranding> {
  const [logos, heroes] = await Promise.all([
    searchThemeArtwork(query, 'logo'),
    searchThemeArtwork(query, 'hero'),
  ])
  if (!logos.length)
    throw new Error('No SteamGridDB logo found for this exact game title.')
  if (!heroes.length) throw new Error('No SteamGridDB hero found for this game.')
  const [logoImage, wallpaper] = await Promise.all([
    fetchThemeArtwork(logos[0].imageUrl, 'logo'),
    fetchThemeArtwork(heroes[0].imageUrl, 'hero'),
  ])
  return { artworkQuery: query, logoImage, wallpaper }
}

/** Resolve bundled artwork for a built-in game theme when the theme id is known.
 *  Returns `undefined` for custom themes or when no bundle exists. */
export async function bundledThemeBranding(
  themeId: string,
): Promise<Partial<ThemeBranding> | undefined> {
  const logo = localThemeArtwork(themeId, 'logo')
  const hero = localThemeArtwork(themeId, 'hero')
  if (logo && hero) return { logoImage: logo, wallpaper: hero }
  const [logoImage, wallpaper] = await Promise.all([
    bundledThemeArtwork(themeId, 'logo'),
    bundledThemeArtwork(themeId, 'hero'),
  ])
  if (!logoImage && !wallpaper) return undefined
  return { logoImage: mediaSrc(logoImage), wallpaper: mediaSrc(wallpaper) }
}

export async function searchThemeStudioArtwork(query: string, slot: 'logo' | 'hero') {
  const [dedicated, general] = await Promise.allSettled([
    searchThemeArtwork(query, slot),
    slot === 'hero' ? searchGameArtwork(query, 'hero', undefined, 'other') : undefined,
  ])
  const results = general.status === 'fulfilled' ? general.value : undefined
  return {
    hits: [
      ...(dedicated.status === 'fulfilled' ? dedicated.value : []),
      ...(results?.hits.filter((hit) => hit.source !== 'SteamGridDB') ?? []),
    ],
    warnings: [
      ...(dedicated.status === 'rejected' ? [String(dedicated.reason)] : []),
      ...(general.status === 'rejected' ? [String(general.reason)] : []),
      ...(results?.warnings ?? []),
    ],
  }
}
