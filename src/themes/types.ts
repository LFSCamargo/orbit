export type ThemeId = 'orbit' | 'ps5' | 'switch-2' | 'custom'

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

export interface ThemeDefinition {
  id: string
  name: string
  description?: string
  author?: string
  fonts?: {
    display?: string
    body?: string
  }
  colors: ThemeColors
  radius?: string
  cardRadius?: string
  blur?: string
  backgroundStyle?: string
  layout?: 'orbit' | 'ps5' | 'switch'
  motion?: {
    duration?: string
    easing?: string
  }
}

/** Built-in themes shipped with Orbit. Custom themes load from ~/Library/Application Support/Orbit/themes/*.json */
export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: 'orbit',
    name: 'Orbit Default',
    description: 'Clean cinematic dark launcher with hero rows.',
    author: 'Orbit',
    fonts: { display: 'DM Sans', body: 'DM Sans' },
    colors: {
      canvas: '5 7 12',
      surface: '12 16 24',
      panel: '18 24 34',
      foreground: '244 246 250',
      muted: '148 160 178',
      accent: '120 196 255',
      focus: '180 220 255',
      border: '42 52 68',
    },
    radius: '1.25rem',
    cardRadius: '1rem',
    backgroundStyle: 'radial',
    layout: 'orbit',
    motion: { duration: '0.35s', easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  },
  {
    id: 'ps5',
    name: 'PlayStation 5',
    description: 'Immersive artwork, circular tiles, and glass panels.',
    author: 'Orbit',
    fonts: { display: 'DM Sans', body: 'DM Sans' },
    colors: {
      canvas: '10 22 40',
      surface: '10 22 40',
      panel: '12 24 41',
      foreground: '236 242 255',
      muted: '150 170 200',
      accent: '70 150 255',
      focus: '120 190 255',
      border: '50 72 110',
    },
    radius: '1.75rem',
    cardRadius: '1.25rem',
    backgroundStyle: 'ps5',
    layout: 'ps5',
    motion: { duration: '0.42s', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  },
  {
    id: 'switch-2',
    name: 'Switch 2',
    description: 'Dark home screen with square tiles and bottom dock.',
    author: 'Orbit',
    fonts: { display: 'DM Sans', body: 'DM Sans' },
    colors: {
      canvas: '0 0 0',
      surface: '0 0 0',
      panel: '20 20 20',
      foreground: '242 242 247',
      muted: '152 152 159',
      accent: '0 212 255',
      focus: '0 200 232',
      border: '58 58 64',
    },
    radius: '1.5rem',
    cardRadius: '1.1rem',
    backgroundStyle: 'switch',
    layout: 'switch',
    motion: { duration: '0.32s', easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' },
  },
]
