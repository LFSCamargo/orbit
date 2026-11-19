import { expect, it } from 'vitest'
import {
  libraryFadeStyleKey,
  libraryFadeStylesFromChrome,
  snapFadeChrome,
  syncLibraryFadeStyles,
} from '../libraryViewportFadeDom'

it('snaps subpixel chrome so repeated scroll ticks share one key', () => {
  const a = snapFadeChrome({
    topSolid: 166.1,
    fadeTop: 75.1,
    bottomSolid: 680.1,
    gridTop: 270.1,
    innerHeight: 720.1,
  })
  const b = snapFadeChrome({
    topSolid: 166.4,
    fadeTop: 75.4,
    bottomSolid: 680.4,
    gridTop: 270.4,
    innerHeight: 720.4,
  })
  expect(libraryFadeStyleKey(a)).toBe(libraryFadeStyleKey(b))
})

it('builds stable mask styles from snapped chrome', () => {
  const styles = libraryFadeStylesFromChrome({
    topSolid: 166,
    fadeTop: 76,
    bottomSolid: 681,
    gridTop: 270,
    innerHeight: 720,
  })
  expect(styles.maskImage).toContain('linear-gradient')
  expect(styles.maskPosition).toBe('0px -270px')
  expect(styles.maskSize).toBe('100% 720px')
})

it('skips DOM writes when the fade key is unchanged', () => {
  const el = document.createElement('div')
  const chrome = {
    topSolid: 100,
    fadeTop: 48,
    bottomSolid: 800,
    gridTop: 200,
    innerHeight: 900,
  }
  const first = syncLibraryFadeStyles(el, chrome, '')
  const second = syncLibraryFadeStyles(el, chrome, first)
  expect(second).toBe(first)
  expect(el.style.maskImage).toContain('linear-gradient')
})
