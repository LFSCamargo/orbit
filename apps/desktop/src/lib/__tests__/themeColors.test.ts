import { describe, expect, it } from 'vitest'
import { focusFromAccent, hexToRgb, rgbToHex, studioThemeId } from '@/lib/themeColors'

describe('theme color conversion', () => {
  it('round-trips hex and RGB triplets', () => {
    expect(rgbToHex('220 30 48')).toBe('#dc1e30')
    expect(hexToRgb('#dc1e30')).toBe('220 30 48')
    expect(hexToRgb('DC1E30')).toBe('220 30 48')
  })

  it('rejects malformed input', () => {
    expect(hexToRgb('#fff')).toBeNull()
    expect(hexToRgb('red')).toBeNull()
    expect(rgbToHex('300 0 0')).toBe('#000000')
  })

  it('lightens accents for focus', () => {
    expect(focusFromAccent('0 0 0')).toBe('115 115 115')
    expect(focusFromAccent('255 255 255')).toBe('255 255 255')
  })
})

describe('studioThemeId', () => {
  it('builds a safe custom- slug', () => {
    expect(studioThemeId('My Devil May Cry 5!')).toBe('custom-my-devil-may-cry-5')
    expect(studioThemeId('../../etc')).toBe('custom-etc')
    expect(studioThemeId('***')).toBe('custom-theme')
    expect(studioThemeId('a'.repeat(80))).toHaveLength('custom-'.length + 40)
  })
})
