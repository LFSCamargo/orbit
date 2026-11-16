import { libraryViewportFadeMask } from './libraryViewportFade'

export type LibraryFadeChrome = {
  topSolid: number
  fadeTop: number
  bottomSolid: number
  gridTop: number
  innerHeight: number
}

/** Round subpixels so WebKit mask stops thrashing on scroll. */
export function snapFadeChrome(chrome: LibraryFadeChrome): LibraryFadeChrome {
  return {
    topSolid: Math.round(chrome.topSolid),
    fadeTop: Math.round(chrome.fadeTop),
    bottomSolid: Math.round(chrome.bottomSolid),
    gridTop: Math.round(chrome.gridTop),
    innerHeight: Math.round(chrome.innerHeight),
  }
}

export function libraryFadeStyleKey(chrome: LibraryFadeChrome): string {
  const c = snapFadeChrome(chrome)
  return `${c.topSolid},${c.fadeTop},${c.bottomSolid},${c.gridTop},${c.innerHeight}`
}

export function libraryFadeStylesFromChrome(
  chrome: LibraryFadeChrome,
): Record<string, string> {
  const c = snapFadeChrome(chrome)
  const mask = libraryViewportFadeMask(c.topSolid, c.bottomSolid, c.fadeTop)
  if (!mask) {
    return {
      WebkitMaskImage: '',
      maskImage: '',
      WebkitMaskSize: '',
      maskSize: '',
      WebkitMaskPosition: '',
      maskPosition: '',
      WebkitMaskRepeat: '',
      maskRepeat: '',
    }
  }
  const size = `100% ${c.innerHeight}px`
  const position = `0px ${-c.gridTop}px`
  return {
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: size,
    maskSize: size,
    WebkitMaskPosition: position,
    maskPosition: position,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
  }
}

export function syncLibraryFadeStyles(
  element: HTMLElement,
  chrome: LibraryFadeChrome,
  previousKey: string,
): string {
  const key = libraryFadeStyleKey(chrome)
  if (key === previousKey) return previousKey
  const styles = libraryFadeStylesFromChrome(chrome)
  element.style.webkitMaskImage = styles.WebkitMaskImage
  element.style.maskImage = styles.maskImage
  element.style.webkitMaskSize = styles.WebkitMaskSize
  element.style.maskSize = styles.maskSize
  element.style.webkitMaskPosition = styles.WebkitMaskPosition
  element.style.maskPosition = styles.maskPosition
  element.style.webkitMaskRepeat = styles.WebkitMaskRepeat
  element.style.maskRepeat = styles.maskRepeat
  return key
}
