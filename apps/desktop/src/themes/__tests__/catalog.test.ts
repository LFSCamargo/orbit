import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  defaultTheme,
  isBrandedTheme,
  resolveThemeId,
} from '@/themes/catalog'

const RGB = /^\d{1,3} \d{1,3} \d{1,3}$/

describe('BUILT_IN_THEMES', () => {
  it('starts with the liquid glass default', () => {
    expect(defaultTheme().id).toBe(DEFAULT_THEME_ID)
    expect(defaultTheme().kind).toBe('color')
  })

  it('has unique ids and valid RGB triplets', () => {
    const ids = BUILT_IN_THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const theme of BUILT_IN_THEMES) {
      for (const value of Object.values(theme.colors)) expect(value).toMatch(RGB)
      expect(theme.id.startsWith('custom-')).toBe(false)
    }
  })

  it('ships every requested game theme with an artwork query and no written logo', () => {
    const games = BUILT_IN_THEMES.filter((theme) => theme.kind === 'game')
    expect(games.map((theme) => theme.id)).toEqual([
      'devil-may-cry-5',
      'god-of-war',
      'cyberpunk-2077',
      'zelda-ocarina-of-time',
      'gta-v',
      'gta-vi',
      'zelda-breath-of-the-wild',
      'super-mario',
    ])
    for (const theme of games) {
      expect(theme.branding?.logoText).toBeUndefined()
      for (const value of Object.values(theme.colors)) expect(value).toMatch(RGB)
      expect(theme.branding?.artworkQuery).toBeTruthy()
    }
  })

  it('does not brand color themes', () => {
    for (const theme of BUILT_IN_THEMES.filter((item) => item.kind === 'color')) {
      expect(isBrandedTheme(theme)).toBe(false)
    }
  })
})

describe('resolveThemeId', () => {
  it('migrates retired platform shells to the default', () => {
    for (const legacy of [
      'orbit',
      'macos',
      'ps5',
      'switch-2',
      'aurora',
      'ember',
      'sakura',
      'graphite',
      'steam-big-picture',
    ]) {
      expect(resolveThemeId(legacy, BUILT_IN_THEMES)).toBe(DEFAULT_THEME_ID)
    }
  })

  it('keeps known ids and falls back for unknown values', () => {
    expect(resolveThemeId('god-of-war', BUILT_IN_THEMES)).toBe('god-of-war')
    expect(resolveThemeId('custom-gone', BUILT_IN_THEMES)).toBe(DEFAULT_THEME_ID)
    expect(resolveThemeId(null, BUILT_IN_THEMES)).toBe(DEFAULT_THEME_ID)
  })
})

it('offers only Liquid Glass as a built-in look', () => {
  expect(BUILT_IN_THEMES.filter((t) => t.kind === 'color').map((t) => t.id)).toEqual([
    'liquid-glass',
  ])
  expect(defaultTheme().colors.accent).toBe('249 115 22')
})
