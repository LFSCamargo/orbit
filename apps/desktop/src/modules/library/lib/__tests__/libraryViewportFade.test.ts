import { expect, it } from 'vitest'
import { libraryViewportFadeMask } from '../libraryViewportFade'

it('fades list art at the toolbar and footer without a solid band', () => {
  expect(libraryViewportFadeMask(100, 800, 48, 56)).toBe(
    'linear-gradient(to bottom, transparent 0px, transparent 100px, black 148px, black 744px, transparent 800px)',
  )
})

it('skips a mask when the window is too short to fade', () => {
  expect(libraryViewportFadeMask(200, 240)).toBe('')
})
