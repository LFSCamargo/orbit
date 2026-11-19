import { expect, it } from 'vitest'
import { GLOBE_SILHOUETTE, globeViewOffset, planetGeometry } from '../planetGeometry'

/** Height of the planet's rim above the circle's centre line at `x`. */
function rimY(g: ReturnType<typeof planetGeometry>, width: number, x: number) {
  const centreY = g.top + g.radius
  return centreY - Math.sqrt(g.radius ** 2 - (x - width / 2) ** 2)
}

for (const [width, height] of [
  [1080, 700],
  [1392, 640],
  [976, 592],
  [1080, 520],
]) {
  it(`peaks at 84% and leaves through the bottom edge for a ${width}×${height} card`, () => {
    const g = planetGeometry(width, height)
    expect(g.top).toBeCloseTo(height * 0.84)
    // The rim reaches the bottom just inside each corner, never a side.
    expect(rimY(g, width, width * 0.03)).toBeCloseTo(height, 0)
    expect(rimY(g, width, 0)).toBeGreaterThan(height)
    expect(rimY(g, width, width)).toBeGreaterThan(height)
  })
}

it('sizes the globe photo so its arc matches the rim', () => {
  const g = planetGeometry(1080, 700)
  // The photo's own arc radius is ~0.869 × its width.
  expect(g.photoWidth * 0.869).toBeCloseTo(g.radius, -1)
})

it('frames the 3D globe so its outline is the planet circle', () => {
  const width = 1080
  const height = 700
  const planet = planetGeometry(width, height)
  const view = globeViewOffset(width, height)
  // The globe's on-screen radius in the full frame equals the planet radius…
  expect((view.fullHeight / 2) * GLOBE_SILHOUETTE).toBeCloseTo(planet.radius)
  expect(view.fullWidth).toBe(view.fullHeight)
  // …and the card's window puts the globe's top at the horizon, centred.
  const globeTopInWindow = view.fullHeight / 2 - planet.radius - view.y
  expect(globeTopInWindow).toBeCloseTo(planet.top)
  expect(view.x + width / 2).toBeCloseTo(view.fullWidth / 2)
  expect([view.width, view.height]).toEqual([width, height])
})

it('matches the published camera: 45° field of view, 3.5 radii away', () => {
  const alpha = Math.asin(1 / 3.5)
  expect(GLOBE_SILHOUETTE).toBeCloseTo(Math.tan(alpha) / Math.tan(Math.PI / 8))
})
