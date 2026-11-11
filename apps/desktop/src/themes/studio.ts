import { localThemeArtwork } from '@/lib/bundledArtwork'
import { hexToRgb, rgbToHex, studioThemeId } from '@/lib/themeColors'
import type { LogoStyle, ThemeColors, ThemeDefinition } from '@/themes/types'

export interface StudioDraft {
  name: string
  artworkQuery: string
  logoText: string
  logoStyle: LogoStyle
  tagline: string
  colors: Record<keyof ThemeColors, string>
  logoImage?: string
  wallpaper?: string
}

export const LOGO_STYLES: { id: LogoStyle; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'serif', label: 'Epic serif' },
  { id: 'gothic', label: 'Gothic' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'neon', label: 'Neon' },
  { id: 'rounded', label: 'Rounded' },
]

function isStudioTheme(theme: ThemeDefinition): boolean {
  return theme.kind === 'custom' && theme.id.startsWith('custom-')
}

function colorsToHex(colors: ThemeColors): Record<keyof ThemeColors, string> {
  return {
    canvas: rgbToHex(colors.canvas),
    surface: rgbToHex(colors.surface),
    panel: rgbToHex(colors.panel),
    foreground: rgbToHex(colors.foreground),
    muted: rgbToHex(colors.muted),
    accent: rgbToHex(colors.accent),
    focus: rgbToHex(colors.focus),
    border: rgbToHex(colors.border),
  }
}

export function draftFromTheme(theme: ThemeDefinition): StudioDraft {
  const branding = theme.branding ?? {}
  const bundled = (slot: 'logo' | 'hero', image?: string) =>
    theme.kind === 'game' && localThemeArtwork(theme.id, slot)
      ? `orbit-bundled:${theme.id}:${slot}`
      : image
  return {
    name: isStudioTheme(theme) ? theme.name : `My ${theme.name}`,
    artworkQuery: branding.artworkQuery ?? '',
    logoText: '',
    logoStyle: branding.logoStyle ?? 'clean',
    tagline: branding.tagline ?? '',
    colors: colorsToHex(theme.colors),
    logoImage: bundled('logo', branding.logoImage),
    wallpaper: bundled('hero', branding.wallpaper),
  }
}

function text(value: string): string | undefined {
  return value.trim() || undefined
}

function hexColorsToRgb(hexColors: Record<keyof ThemeColors, string>): ThemeColors {
  const fallback: ThemeColors = {
    canvas: '6 6 8',
    surface: '14 14 16',
    panel: '22 22 25',
    foreground: '250 250 249',
    muted: '150 150 158',
    accent: '249 115 22',
    focus: '250 204 21',
    border: '58 58 62',
  }
  const result: Partial<ThemeColors> = {}
  for (const key of Object.keys(hexColors) as Array<keyof ThemeColors>) {
    const rgb = hexToRgb(hexColors[key])
    result[key] = rgb ?? fallback[key]
  }
  return result as ThemeColors
}

export function buildStudioTheme(
  base: ThemeDefinition,
  draft: StudioDraft,
): ThemeDefinition {
  const name = text(draft.name) ?? base.name
  return {
    ...base,
    id: isStudioTheme(base) ? base.id : studioThemeId(name),
    name,
    kind: 'custom',
    preview: undefined,
    author: 'You',
    description: isStudioTheme(base) ? base.description : `Based on ${base.name}.`,
    colors: hexColorsToRgb(draft.colors),
    branding: {
      tagline: text(draft.tagline),
      logoImage: draft.logoImage,
      wallpaper: draft.wallpaper,
      artworkQuery: text(draft.artworkQuery),
    },
  }
}
