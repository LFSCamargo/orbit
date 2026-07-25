import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}))

import { cssUrl, mediaSrc } from '@/lib/media'

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
