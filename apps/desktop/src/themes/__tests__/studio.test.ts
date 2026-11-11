import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES, defaultTheme } from '@/themes/catalog'
import { buildStudioTheme, draftFromTheme } from '@/themes/studio'
import type { ThemeDefinition } from '@/themes/types'

const dmc = BUILT_IN_THEMES.find((theme) => theme.id === 'devil-may-cry-5')!
const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('draftFromTheme', () => {
  it('prefixes built-in names and copies branding', () => {
    const draft = draftFromTheme(dmc)
    expect(draft.name).toBe('My Devil May Cry 5')
    expect(draft.logoText).toBe('')
    expect(draft.artworkQuery).toBe('Devil May Cry 5')
    expect(draft.logoStyle).toBe('clean')
    expect(draft.colors.accent).toBe('#dc2626')
    expect(draft.colors.canvas).toBe('#0a0608')
  })

  it('keeps the name of an existing custom theme', () => {
    const custom: ThemeDefinition = {
      ...dmc,
      id: 'custom-mine',
      name: 'Mine',
      kind: 'custom',
    }
    expect(draftFromTheme(custom).name).toBe('Mine')
  })
})

describe('buildStudioTheme', () => {
  it('creates a custom theme from a built-in base', () => {
    const draft = {
      ...draftFromTheme(dmc),
      logoImage: PNG,
      colors: { ...draftFromTheme(dmc).colors, accent: '#ff0000' },
    }
    const theme = buildStudioTheme(dmc, draft)
    expect(theme.id).toBe('custom-my-devil-may-cry-5')
    expect(theme.kind).toBe('custom')
    expect(theme.colors.accent).toBe('255 0 0')
    expect(theme.colors.focus).toBe(dmc.colors.focus)
    expect(theme.colors.canvas).toBe(dmc.colors.canvas)
    expect(theme.branding?.logoImage).toBe(PNG)
    expect(theme.branding?.artworkQuery).toBe('Devil May Cry 5')
  })

  it('keeps colors when the draft matches the base', () => {
    const same = buildStudioTheme(dmc, draftFromTheme(dmc))
    expect(same.colors.focus).toBe(dmc.colors.focus)
  })

  it('falls back to default colors for invalid hex values', () => {
    const invalid = buildStudioTheme(dmc, {
      ...draftFromTheme(dmc),
      colors: { ...draftFromTheme(dmc).colors, accent: 'nope' },
    })
    expect(invalid.colors.accent).toBe(defaultTheme().colors.accent)
  })

  it('overwrites the same file when editing a custom theme', () => {
    const custom: ThemeDefinition = {
      ...dmc,
      id: 'custom-mine',
      name: 'Mine',
      kind: 'custom',
    }
    const theme = buildStudioTheme(custom, { ...draftFromTheme(custom), name: 'Renamed' })
    expect(theme.id).toBe('custom-mine')
    expect(theme.name).toBe('Renamed')
  })

  it('drops empty branding text', () => {
    const theme = buildStudioTheme(dmc, {
      ...draftFromTheme(dmc),
      logoText: '  ',
      tagline: '',
    })
    expect(theme.branding?.logoText).toBeUndefined()
    expect(theme.branding?.tagline).toBeUndefined()
  })

  it('does not persist stale catalog preview paths in a studio draft', () => {
    const base = { ...dmc, preview: { hero: '/old/preview.jpg' } }
    expect(buildStudioTheme(base, draftFromTheme(base)).preview).toBeUndefined()
  })
})

it('keeps bundled artwork when saving a copy and preserves a replacement image', () => {
  const draft = draftFromTheme(dmc)
  expect(draft.logoImage).toBe('orbit-bundled:devil-may-cry-5:logo')
  expect(draft.wallpaper).toBe('orbit-bundled:devil-may-cry-5:hero')
  const saved = buildStudioTheme(dmc, { ...draft, logoImage: PNG })
  expect(saved.branding?.logoImage).toBe(PNG)
  expect(saved.branding?.wallpaper).toBe(draft.wallpaper)
})
