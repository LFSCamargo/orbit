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
    platform: 'macos',
    ...overrides,
  }
}

describe('archLabel', () => {
  it('uses platform-appropriate architecture names', () => {
    expect(archLabel('arm64')).toBe('Apple Silicon')
    expect(archLabel('x64')).toBe('Intel')
    expect(archLabel('arm64', 'windows')).toBe('ARM64')
    expect(archLabel('x64', 'linux')).toBe('x86-64')
    expect(archLabel('universal')).toBe('Universal')
    expect(archLabel(null)).toBeNull()
  })
})

describe('assetLabel', () => {
  it('describes installers and archives with their architecture', () => {
    expect(assetLabel(asset({ kind: 'dmg', arch: 'arm64' }))).toBe(
      'macOS disk image · Apple Silicon',
    )
    expect(assetLabel(asset({ kind: 'app-archive', arch: 'x64' }))).toBe(
      'macOS app archive · Intel',
    )
    expect(assetLabel(asset({ kind: 'exe', arch: 'x64', platform: 'windows' }))).toBe(
      'Windows installer · x86-64',
    )
    expect(assetLabel(asset({ kind: 'checksums', platform: null }))).toBe(
      'SHA-256 checksums',
    )
    expect(assetLabel(asset({ kind: 'other', name: 'extra.zip', platform: null }))).toBe(
      'extra.zip',
    )
  })
})
