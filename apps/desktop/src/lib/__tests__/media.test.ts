import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}))

import { cssUrl, mediaSrc, themePreviewSrc } from '@/lib/media'

describe('cssUrl', () => {
  it('quotes the url value', () => {
    expect(cssUrl('asset://localhost/covers/a.png')).toBe(
      'url("asset://localhost/covers/a.png")',
    )
  })

  it('escapes quotes and backslashes', () => {
    expect(cssUrl('path\\with"quote')).toBe('url("path\\\\with\\"quote")')
  })
})

describe('mediaSrc', () => {
  it('passes through remote urls', () => {
    expect(mediaSrc('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
  })

  it('converts local paths via convertFileSrc', () => {
    expect(mediaSrc('/tmp/cover.png')).toBe('asset://localhost/tmp/cover.png')
  })
})

it('resolves bundled references without treating them as filesystem paths', () => {
  expect(mediaSrc('orbit-bundled:god-of-war:logo')).toMatch(/god-of-war\/logo\.webp/)
  expect(mediaSrc('orbit-bundled:../god-of-war:hero')).toBeUndefined()
})

it('keeps Tauri webview bundle URLs intact', () => {
  expect(mediaSrc('tauri://localhost/assets/hero.png')).toBe(
    'tauri://localhost/assets/hero.png',
  )
})

it('uses compact bundled previews for custom copies without changing their full artwork', () => {
  const ref = 'orbit-bundled:god-of-war:hero'
  expect(themePreviewSrc(ref)).toMatch(/preview-hero.*\.webp/)
  expect(mediaSrc(ref)).toMatch(/\/hero.*\.webp/)
  expect(themePreviewSrc('/tmp/cached-preview.jpg')).toBe(
    'asset://localhost/tmp/cached-preview.jpg',
  )
})
