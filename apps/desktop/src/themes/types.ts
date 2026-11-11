export interface ThemeColors {
  canvas: string
  surface: string
  panel: string
  foreground: string
  muted: string
  accent: string
  focus: string
  border: string
}

export type ThemeKind = 'color' | 'game' | 'custom'

export type LogoStyle =
  'clean' | 'serif' | 'gothic' | 'glitch' | 'heavy' | 'neon' | 'rounded'

export interface ThemeBranding {
  /** Wordmark shown in place of the Orbit logo. */
  logoText?: string
  logoStyle?: LogoStyle
  /** Inline raster, opaque bundle reference, or native catalog cache path. */
  logoImage?: string
  /** Full artwork reference; the shell selects its background by context. */
  wallpaper?: string
  tagline?: string
  /** Title used to search SteamGridDB logos and heroes in the theme studio. */
  artworkQuery?: string
}

export interface ThemeDefinition {
  id: string
  name: string
  description?: string
  author?: string
  kind?: ThemeKind
  fonts?: {
    display?: string
    body?: string
  }
  colors: ThemeColors
  radius?: string
  cardRadius?: string
  blur?: string
  motion?: {
    duration?: string
    easing?: string
  }
  branding?: ThemeBranding
  /** Runtime-only cached card artwork returned by the native catalog, never stored in theme JSON. */
  preview?: { logo?: string | null; hero?: string | null }
}
