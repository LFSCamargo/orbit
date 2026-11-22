import { expect, it } from 'vitest'
import { appLayerHidden } from '../appLayer'

it('stops painting Orbit behind a cloud stream that is playing', () => {
  // Regression: Home's backdrops, blur and motion kept compositing under the
  // full-screen player while the WebView decoded the stream.
  expect(appLayerHidden({ overSplash: false, streaming: true })).toBe(true)
  expect(appLayerHidden({ overSplash: false, streaming: false })).toBe(false)
  expect(appLayerHidden({ overSplash: true, streaming: false })).toBe(true)
})
