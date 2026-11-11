import type { ThemeDefinition } from '@/themes/types'

export const DEFAULT_THEME_ID = 'liquid-glass'
const LEGACY_THEME_IDS = new Set([
  'orbit',
  'macos',
  'ps5',
  'switch-2',
  'steam-big-picture',
  'aurora',
  'ember',
  'sakura',
  'graphite',
])

const COMMON = {
  author: 'Orbit',
  fonts: { display: '-apple-system', body: '-apple-system' },
  radius: '1.5rem',
  cardRadius: '1.125rem',
  blur: '28px',
  motion: { duration: '0.4s', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
} as const

const LIQUID_GLASS_COLORS: ThemeDefinition['colors'] = {
  canvas: '6 6 8',
  surface: '14 14 16',
  panel: '22 22 25',
  foreground: '250 250 249',
  muted: '150 150 158',
  accent: '249 115 22',
  focus: '250 204 21',
  border: '58 58 62',
}

const LIQUID_GLASS: ThemeDefinition = {
  ...COMMON,
  id: DEFAULT_THEME_ID,
  name: 'Liquid Glass',
  kind: 'color',
  description: 'Dark grayscale canvas with warm orange and yellow accents.',
  colors: LIQUID_GLASS_COLORS,
}

const GAME_PALETTES: Record<string, ThemeDefinition['colors']> = {
  'devil-may-cry-5': {
    canvas: '10 6 8',
    surface: '20 10 13',
    panel: '30 16 20',
    foreground: '250 250 249',
    muted: '170 150 155',
    accent: '220 38 38',
    focus: '251 146 60',
    border: '80 50 55',
  },
  'god-of-war': {
    canvas: '10 12 16',
    surface: '18 22 28',
    panel: '26 31 39',
    foreground: '250 250 249',
    muted: '155 165 180',
    accent: '200 50 50',
    focus: '251 191 36',
    border: '55 65 80',
  },
  'cyberpunk-2077': {
    canvas: '12 10 8',
    surface: '22 18 14',
    panel: '32 26 20',
    foreground: '250 250 249',
    muted: '170 160 150',
    accent: '250 204 21',
    focus: '6 182 212',
    border: '70 65 58',
  },
  'zelda-ocarina-of-time': {
    canvas: '8 14 10',
    surface: '14 26 18',
    panel: '22 38 28',
    foreground: '250 250 249',
    muted: '150 170 155',
    accent: '34 197 94',
    focus: '250 204 21',
    border: '50 75 58',
  },
  'gta-v': {
    canvas: '8 8 10',
    surface: '16 16 20',
    panel: '24 24 30',
    foreground: '250 250 249',
    muted: '160 160 170',
    accent: '250 204 21',
    focus: '255 255 255',
    border: '60 60 68',
  },
  'gta-vi': {
    canvas: '16 10 12',
    surface: '30 16 20',
    panel: '44 24 30',
    foreground: '250 250 249',
    muted: '180 150 158',
    accent: '244 63 94',
    focus: '251 146 60',
    border: '90 60 68',
  },
  'zelda-breath-of-the-wild': {
    canvas: '10 14 18',
    surface: '18 26 32',
    panel: '26 38 46',
    foreground: '250 250 249',
    muted: '155 170 180',
    accent: '45 212 191',
    focus: '250 204 21',
    border: '55 75 85',
  },
  'super-mario': {
    canvas: '10 10 14',
    surface: '20 20 30',
    panel: '30 30 44',
    foreground: '250 250 249',
    muted: '165 165 175',
    accent: '239 68 68',
    focus: '250 204 21',
    border: '65 65 80',
  },
}

const GAMES = [
  { id: 'devil-may-cry-5', name: 'Devil May Cry 5', query: 'Devil May Cry 5' },
  { id: 'god-of-war', name: 'God of War', query: 'God of War' },
  { id: 'cyberpunk-2077', name: 'Cyberpunk 2077', query: 'Cyberpunk 2077' },
  {
    id: 'zelda-ocarina-of-time',
    name: 'Zelda: Ocarina of Time Remake',
    query: 'The Legend of Zelda: Ocarina of Time',
  },
  { id: 'gta-v', name: 'Grand Theft Auto V', query: 'Grand Theft Auto V' },
  { id: 'gta-vi', name: 'Grand Theft Auto VI', query: 'Grand Theft Auto VI' },
  {
    id: 'zelda-breath-of-the-wild',
    name: 'Zelda: Breath of the Wild',
    query: 'The Legend of Zelda: Breath of the Wild',
  },
  { id: 'super-mario', name: 'Super Mario', query: 'Super Mario Odyssey' },
]

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  LIQUID_GLASS,
  ...GAMES.map(({ id, name, query }) => ({
    ...COMMON,
    id,
    name,
    kind: 'game' as const,
    description: 'SteamGridDB logo and hero background.',
    colors: GAME_PALETTES[id] ?? LIQUID_GLASS_COLORS,
    branding: { artworkQuery: query },
  })),
]

export function defaultTheme(): ThemeDefinition {
  return LIQUID_GLASS
}
export function resolveThemeId(saved: unknown, themes: ThemeDefinition[]): string {
  if (typeof saved !== 'string' || LEGACY_THEME_IDS.has(saved)) return DEFAULT_THEME_ID
  return themes.some((item) => item.id === saved) ? saved : DEFAULT_THEME_ID
}
export function isBrandedTheme(theme: ThemeDefinition): boolean {
  return Boolean(theme.branding?.logoImage)
}
