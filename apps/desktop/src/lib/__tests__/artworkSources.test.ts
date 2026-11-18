import { expect, it } from 'vitest'
import { artworkSources } from '../artworkSources'

const CDN = 'https://cdn.akamai.steamstatic.com/steam/apps/1091500'

it('uses Steam library art with a 2x source and a tiny capsule to blur up from', () => {
  expect(artworkSources({}, '1091500')).toEqual({
    high: `${CDN}/library_600x900.jpg`,
    high2x: `${CDN}/library_600x900_2x.jpg`,
    low: `${CDN}/capsule_231x87.jpg`,
  })
})

it('prefers stored artwork, keeping the Steam capsule as the quick preview', () => {
  expect(artworkSources({ icon: 'https://img/icon.png' }, '1091500')).toEqual({
    high: 'https://img/icon.png',
    low: `${CDN}/capsule_231x87.jpg`,
  })
})

it('keeps the 2x source when the stored cover is Steam library art itself', () => {
  expect(artworkSources({ cover: `${CDN}/library_600x900.jpg` }, '1091500').high2x).toBe(
    `${CDN}/library_600x900_2x.jpg`,
  )
})

it('has nothing to show without stored art or a valid Steam app id', () => {
  expect(artworkSources({}, null)).toEqual({})
  expect(artworkSources({}, 'not-an-id')).toEqual({})
})
