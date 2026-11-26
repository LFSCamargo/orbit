import { describe, expect, it } from 'vitest'
import { shorten } from '../card'

describe('shorten', () => {
  it('keeps short text and cuts long text at a word boundary', () => {
    expect(shorten('Short line', 40)).toBe('Short line')
    expect(
      shorten('Orbit Wine containers, Xbox Cloud Gaming, DLSS-class upscaling', 50),
    ).toBe('Orbit Wine containers, Xbox Cloud Gaming…')
  })
})
