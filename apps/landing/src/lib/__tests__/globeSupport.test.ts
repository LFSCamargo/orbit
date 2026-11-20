import { expect, it } from 'vitest'
import { canShow3DGlobe, isSoftwareRenderer } from '../globeSupport'

it('shows the 3D globe only with WebGL, motion and a wide enough window', () => {
  const ok = { webgl: true, reducedMotion: false, width: 1440, finePointer: true }
  expect(canShow3DGlobe(ok)).toBe(true)
  expect(canShow3DGlobe({ ...ok, webgl: false })).toBe(false)
  expect(canShow3DGlobe({ ...ok, reducedMotion: true })).toBe(false)
  expect(canShow3DGlobe({ ...ok, width: 390 })).toBe(false)
})

it('never shows the 3D globe on phones or tablets, even in landscape', () => {
  // Regression: an iPhone in landscape (844 px) passed the width check and
  // loaded three.js. The globe is for the desktop web: a mouse or trackpad.
  const phone = { webgl: true, reducedMotion: false, width: 844, finePointer: false }
  expect(canShow3DGlobe(phone)).toBe(false)
  expect(canShow3DGlobe({ ...phone, width: 1180 })).toBe(false)
})

it('treats software rendering as no GPU', () => {
  for (const name of [
    'Google SwiftShader',
    'llvmpipe (LLVM 15)',
    'Microsoft Basic Render Driver',
  ])
    expect(isSoftwareRenderer(name)).toBe(true)
  expect(isSoftwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro)')).toBe(
    false,
  )
})
