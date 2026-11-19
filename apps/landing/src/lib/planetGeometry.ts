/** Horizon peak, as a share of the card height from the top. */
export const HORIZON_RATIO = 0.84
/** The rim meets the card's bottom edge this far in from each side. */
const CORNER_INSET = 0.03
/** The globe photo's arc has a radius of ~0.869 × its width. */
const PHOTO_ARC = 0.869

/** The planet circle for a card: its rim peaks at 84% of the height and
 * leaves through the bottom edge just inside each corner, so it never meets
 * a side (which reads as the planet being cut off) whatever the card's
 * proportions. A circle through the peak and both exit points has radius
 * (c² + s²) / 2s for half-chord c and sagitta s. Pixels.
 */
export function planetGeometry(width: number, height: number) {
  const top = height * HORIZON_RATIO
  const halfChord = width * (0.5 - CORNER_INSET)
  const sagitta = height - top
  const radius = (halfChord ** 2 + sagitta ** 2) / (2 * sagitta)
  return { top, radius, photoWidth: radius / PHOTO_ARC }
}

/** Share of the half-frame the 3D globe's outline fills with the published
 * Globe3D camera: 45° vertical field of view, 3.5 radii from the centre. */
export const GLOBE_SILHOUETTE = Math.tan(Math.asin(1 / 3.5)) / Math.tan(Math.PI / 8)

/** The window of a larger square frame that the card shows, so the Globe3D
 * sphere's outline is exactly the planet circle: its top at the horizon,
 * centred, with the planet's radius. Only this window is rendered. */
export function globeViewOffset(width: number, height: number) {
  const { top, radius } = planetGeometry(width, height)
  const full = (2 * radius) / GLOBE_SILHOUETTE
  return {
    fullWidth: full,
    fullHeight: full,
    x: full / 2 - width / 2,
    y: full / 2 - radius - top,
    width,
    height,
  }
}
