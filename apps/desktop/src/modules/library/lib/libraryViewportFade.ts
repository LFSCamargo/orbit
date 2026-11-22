const LIBRARY_EDGE_FADE_PX = 56

/** Viewport-space mask so covers dissolve under chrome instead of a dimming band. */
export function libraryViewportFadeMask(
  topSolid: number,
  bottomSolid: number,
  fadeTop = LIBRARY_EDGE_FADE_PX,
  fadeBottom = LIBRARY_EDGE_FADE_PX,
) {
  const fadeIn = topSolid + fadeTop
  const fadeOut = bottomSolid - fadeBottom
  if (fadeOut <= fadeIn) return ''
  return `linear-gradient(to bottom, transparent 0px, transparent ${topSolid}px, black ${fadeIn}px, black ${fadeOut}px, transparent ${bottomSolid}px)`
}
