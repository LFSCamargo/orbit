import { describe, expect, it } from 'vitest'
import { archLabel, assetLabel } from '../labels'
import type { ReleaseAsset } from '../releases'

function asset(overrides: Partial<ReleaseAsset>): ReleaseAsset {
  return {
    name: 'x',
    url: 'https://github.com/x',
    size: 1,
    kind: 'dmg',
    arch: null,
    ...overrides,
  }
}

describe('archLabel', () => {
  it('names Mac architectures', () => {
    expect(archLabel('arm64')).toBe('Apple Silicon')
    expect(archLabel('x64')).toBe('Intel')
    expect(archLabel('universal')).toBe('Universal')
    expect(archLabel(null)).toBeNull()
  })
})

describe('assetLabel', () => {
  it('describes the disk image, app archive, and checksums', () => {
    expect(assetLabel(asset({ kind: 'dmg', arch: 'arm64' }))).toBe(
      'macOS disk image · Apple Silicon',
    )
    expect(assetLabel(asset({ kind: 'app-archive', arch: 'x64' }))).toBe(
      'macOS app archive · Intel',
    )
    expect(assetLabel(asset({ kind: 'checksums' }))).toBe('SHA-256 checksums')
  })
})
