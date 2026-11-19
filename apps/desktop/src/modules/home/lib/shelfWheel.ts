/** Pixels per wheel "line" (`deltaMode` 1), as browsers scroll a line. */
const LINE_PX = 16

type ShelfWheel = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey'>
type ShelfMetrics = Pick<HTMLElement, 'scrollLeft' | 'clientWidth' | 'scrollWidth'>

/** Horizontal scroll for a vertical mouse wheel over the shelf, or 0 to leave
 * the event alone: horizontal wheels and trackpad swipes already scroll the
 * shelf natively, pinch zooms, and a finite shelf at its edge lets the page scroll.
 */
export function shelfWheelDelta(wheel: ShelfWheel, shelf: ShelfMetrics): number {
  if (wheel.ctrlKey || Math.abs(wheel.deltaY) <= Math.abs(wheel.deltaX)) return 0
  const unit =
    wheel.deltaMode === 1 ? LINE_PX : wheel.deltaMode === 2 ? shelf.clientWidth : 1
  const delta = wheel.deltaY * unit
  const max = shelf.scrollWidth - shelf.clientWidth
  if (delta < 0 && shelf.scrollLeft <= 0) return 0
  if (delta > 0 && shelf.scrollLeft >= max - 1) return 0
  return delta
}
