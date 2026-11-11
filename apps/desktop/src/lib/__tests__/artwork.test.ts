import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}))

import {
  artworkPreview,
  gameHeroImage,
  gameTileImage,
  isBase64Artwork,
} from '@/lib/artwork'

describe('gameHeroImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers hero over cover', () => {
    expect(
      gameHeroImage({
        hero: 'https://cdn.example/hero.jpg',
        cover: 'https://cdn.example/cover.jpg',
      }),
    ).toBe('https://cdn.example/hero.jpg')
  })

  it('falls back to cover when hero is missing', () => {
    expect(gameHeroImage({ cover: '/covers/a.png' })).toBe(
      'asset://localhost/covers/a.png',
    )
  })

  it('returns undefined when no hero or cover', () => {
    expect(gameHeroImage({ icon: 'https://cdn.example/icon.png' })).toBeUndefined()
  })
})

describe('gameTileImage', () => {
  it('prefers icon for square tiles', () => {
    expect(
      gameTileImage(
        {
          icon: 'data:image/png;base64,abc',
          cover: 'https://cdn.example/cover.jpg',
          hero: 'https://cdn.example/hero.jpg',
        },
        'square',
      ),
    ).toBe('data:image/png;base64,abc')
  })

  it('falls back through cover then hero for square tiles', () => {
    expect(gameTileImage({ cover: 'https://cdn.example/cover.jpg' }, 'square')).toBe(
      'https://cdn.example/cover.jpg',
    )
    expect(gameTileImage({ hero: 'https://cdn.example/hero.jpg' }, 'square')).toBe(
      'https://cdn.example/hero.jpg',
    )
  })

  it('prefers cover for portrait tiles by default', () => {
    expect(
      gameTileImage({
        cover: 'https://cdn.example/cover.jpg',
        icon: 'https://cdn.example/icon.png',
        hero: 'https://cdn.example/hero.jpg',
      }),
    ).toBe('https://cdn.example/cover.jpg')
  })

  it('falls back through icon then hero for portrait tiles', () => {
    expect(gameTileImage({ icon: 'https://cdn.example/icon.png' })).toBe(
      'https://cdn.example/icon.png',
    )
    expect(gameTileImage({ hero: 'https://cdn.example/hero.jpg' })).toBe(
      'https://cdn.example/hero.jpg',
    )
  })
})

describe('artworkPreview', () => {
  it('returns the media source for the requested slot', () => {
    const artwork = {
      cover: 'https://cdn.example/cover.jpg',
      hero: 'https://cdn.example/hero.jpg',
      icon: 'https://cdn.example/icon.png',
    }
    expect(artworkPreview(artwork, 'cover')).toBe('https://cdn.example/cover.jpg')
    expect(artworkPreview(artwork, 'hero')).toBe('https://cdn.example/hero.jpg')
    expect(artworkPreview(artwork, 'icon')).toBe('https://cdn.example/icon.png')
  })

  it('returns undefined for an empty slot', () => {
    expect(artworkPreview({}, 'hero')).toBeUndefined()
  })
})

describe('isBase64Artwork', () => {
  it('detects data:image URLs', () => {
    expect(isBase64Artwork('data:image/png;base64,abc')).toBe(true)
    expect(isBase64Artwork('data:image/jpeg;base64,/9j/')).toBe(true)
  })

  it('rejects non-base64 values', () => {
    expect(isBase64Artwork('https://cdn.example/cover.jpg')).toBe(false)
    expect(isBase64Artwork('/local/path.png')).toBe(false)
    expect(isBase64Artwork(undefined)).toBe(false)
    expect(isBase64Artwork(null)).toBe(false)
    expect(isBase64Artwork('')).toBe(false)
  })
})
