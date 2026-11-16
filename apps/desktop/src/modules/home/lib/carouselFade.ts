export type ShelfEdgeFade = 'none' | 'left' | 'right' | 'both'

/** O(1) scroll metrics → which carousel edges need a fade. */
export function shelfEdgeFade(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  epsilon = 1,
): ShelfEdgeFade {
  if (scrollWidth <= clientWidth + epsilon) return 'none'
  const atStart = scrollLeft <= epsilon
  const atEnd = scrollLeft + clientWidth >= scrollWidth - epsilon
  if (!atStart && !atEnd) return 'both'
  if (atStart) return 'right'
  return 'left'
}

const FADE_MASK: Record<ShelfEdgeFade, string> = {
  none: '',
  left: '[mask-image:linear-gradient(to_right,transparent,black_5.5rem,black)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_5.5rem,black)]',
  right:
    '[mask-image:linear-gradient(to_right,black,black_calc(100%-5.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,black,black_calc(100%-5.5rem),transparent)]',
  both: '[mask-image:linear-gradient(to_right,transparent,black_5.5rem,black_calc(100%-5.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_5.5rem,black_calc(100%-5.5rem),transparent)]',
}

export function shelfFadeMaskClass(fade: ShelfEdgeFade) {
  return FADE_MASK[fade]
}

export const SHELF_FOOTER_DISSOLVE_MASK =
  '[mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-3.5rem),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-3.5rem),transparent)]'
