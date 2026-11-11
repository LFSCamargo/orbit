import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES } from '@/themes/catalog'
import {
  localThemeArtwork,
  localThemePreview,
  packagedThemePreview,
} from '../bundledArtwork'

describe('local theme artwork', () => {
  it('provides a real logo and hero for every branded theme offline', () => {
    for (const theme of BUILT_IN_THEMES.filter((theme) => theme.kind === 'game')) {
      for (const slot of ['logo', 'hero'] as const) {
        expect(localThemeArtwork(theme.id, slot)).toMatch(/\.(png|jpg|webp)(\?|$)/)
      }
    }
  })
  it('rejects unknown themes and slots', () => {
    expect(localThemeArtwork('../god-of-war', 'logo')).toBeNull()
    expect(localThemeArtwork('god-of-war', '../logo')).toBeNull()
  })
})

it('provides compact packaged card previews for every built-in game theme', () => {
  for (const theme of BUILT_IN_THEMES.filter((theme) => theme.kind === 'game')) {
    expect(localThemePreview(theme.id, 'logo')).toMatch(/preview-logo.*\.webp/)
    expect(localThemePreview(theme.id, 'hero')).toMatch(/preview-hero.*\.webp/)
  }
  expect(localThemePreview('../god-of-war', 'hero')).toBeNull()
})

it('distinguishes prepared thumbnails from full-image fallbacks', () => {
  expect(packagedThemePreview('god-of-war', 'hero')).toMatch(/preview-hero.*\.webp/)
  expect(packagedThemePreview('custom-unbundled', 'hero')).toBeNull()
})
