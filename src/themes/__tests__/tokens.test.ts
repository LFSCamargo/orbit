import { describe, expect, it } from 'vitest'
import { isThemedLayout, themeTokens } from '@/themes/tokens'
import type { ThemeLayout } from '@/themes/useThemeLayout'

const layouts: ThemeLayout[] = ['switch', 'ps5', 'orbit']

describe('themeTokens', () => {
  it('returns tokens for every layout', () => {
    for (const layout of layouts) {
      const tokens = themeTokens(layout)
      expect(tokens.layout).toBe(layout)
      expect(tokens.shell).toBeTruthy()
      expect(tokens.panel).toBeTruthy()
      expect(tokens.ink).toBeTruthy()
      expect(tokens.muted).toBeTruthy()
      expect(tokens.accent).toBeTruthy()
      expect(tokens.danger).toBeTruthy()
    }
  })

  it('marks switch and ps5 as themed with square cards', () => {
    expect(themeTokens('switch')).toMatchObject({
      isThemed: true,
      cardVariant: 'square',
    })
    expect(themeTokens('ps5')).toMatchObject({
      isThemed: true,
      cardVariant: 'square',
    })
  })

  it('marks orbit as unthemed with portrait cards', () => {
    expect(themeTokens('orbit')).toMatchObject({
      isThemed: false,
      cardVariant: 'portrait',
    })
  })
})

describe('isThemedLayout', () => {
  it('is true for ps5 and switch only', () => {
    expect(isThemedLayout('ps5')).toBe(true)
    expect(isThemedLayout('switch')).toBe(true)
    expect(isThemedLayout('orbit')).toBe(false)
  })
})
