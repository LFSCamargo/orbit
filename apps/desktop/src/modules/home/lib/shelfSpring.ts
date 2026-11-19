/** Spring physics for wheel scrolling the home shelf. Slightly underdamped
 * (damping ratio ~0.6), so a scroll overshoots by roughly a tenth and settles
 * back in about half a second. Positions are px, time is seconds.
 */

export const SHELF_SPRING = { stiffness: 180, damping: 16 }

/** Longest integration step; longer frames are split so the spring stays stable. */
const MAX_STEP_S = 1 / 120

export interface SpringState {
  position: number
  velocity: number
}

export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  { stiffness, damping } = SHELF_SPRING,
): SpringState {
  let { position, velocity } = state
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP_S))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    velocity += (stiffness * (target - position) - damping * velocity) * h
    position += velocity * h
  }
  return { position, velocity }
}

export function springAtRest({ position, velocity }: SpringState, target: number) {
  return Math.abs(target - position) < 0.5 && Math.abs(velocity) < 8
}

/** Scroll position that lines a card up with the shelf's start. Moving forward
 * (`direction` 1) lands on the next card and backward (-1) on the previous one,
 * so even a small wheel nudge moves a whole card instead of springing back;
 * without a direction it takes the nearest card. The shelf's end counts as a
 * card, so a finite shelf can still reach it.
 */
export function snapToCard(position: number, stride: number, max: number, direction = 0) {
  if (!(stride > 0)) return position
  // Within a pixel of a card already counts as on it.
  const cards = position / stride
  const nearest = Math.round(cards)
  const onCard = Math.abs(cards - nearest) * stride <= 1
  const index =
    onCard || !direction ? nearest : direction > 0 ? Math.ceil(cards) : Math.floor(cards)
  const card = Math.min(max, Math.max(0, index * stride))
  if (!direction && Math.abs(max - position) < Math.abs(card - position)) return max
  return card
}
