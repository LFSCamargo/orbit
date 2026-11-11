import { describe, expect, it } from 'vitest'
import {
  classifyAsset,
  compareVersions,
  findRelease,
  isValidVersion,
  latestStable,
  parseReleases,
  primaryDownload,
} from '../releases'
import { githubRelease } from './fixtures'

describe('classifyAsset', () => {
  it('detects DMGs, app archives, and checksums with their architecture', () => {
    expect(classifyAsset('Orbit-0.3.0-aarch64.dmg')).toEqual({
      kind: 'dmg',
      arch: 'arm64',
      platform: 'macos',
    })
    expect(classifyAsset('Orbit-0.3.0-x86_64.app.tar.gz')).toEqual({
      kind: 'app-archive',
      arch: 'x64',
      platform: 'macos',
    })
    expect(classifyAsset('Orbit-0.3.0-universal.dmg')).toEqual({
      kind: 'dmg',
      arch: 'universal',
      platform: 'macos',
    })
    expect(classifyAsset('Orbit-0.3.0-x64-setup.exe')).toEqual({
      kind: 'exe',
      arch: 'x64',
      platform: 'windows',
    })
    expect(classifyAsset('Orbit-0.3.0-amd64.AppImage')).toEqual({
      kind: 'appimage',
      arch: 'x64',
      platform: 'linux',
    })
    expect(classifyAsset('Orbit-0.3.0-arm64.deb')).toEqual({
      kind: 'deb',
      arch: 'arm64',
      platform: 'linux',
    })
    expect(classifyAsset('SHA256SUMS.txt')).toEqual({
      kind: 'checksums',
      arch: null,
      platform: null,
    })
    expect(classifyAsset('notes.txt')).toEqual({
      kind: 'other',
      arch: null,
      platform: null,
    })
  })
})

describe('compareVersions', () => {
  it('orders numerically and puts prereleases before their final release', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0)
  })
})

describe('isValidVersion', () => {
  it('accepts semver and rejects path-like input', () => {
    expect(isValidVersion('0.3.0')).toBe(true)
    expect(isValidVersion('1.0.0-rc.1')).toBe(true)
    expect(isValidVersion('../etc')).toBe(false)
    expect(isValidVersion('v0.3.0')).toBe(false)
  })
})

describe('parseReleases', () => {
  it('returns published releases newest first', () => {
    const releases = parseReleases([
      githubRelease('0.1.0'),
      githubRelease('0.3.0'),
      githubRelease('0.2.0'),
    ])
    expect(releases.map((r) => r.version)).toEqual(['0.3.0', '0.2.0', '0.1.0'])
    expect(releases[0].assets[0]).toMatchObject({
      name: 'Orbit-0.3.0-aarch64.dmg',
      kind: 'dmg',
      arch: 'arm64',
      platform: 'macos',
      size: 12_582_912,
    })
  })

  it('drops drafts, non-semver tags, and malformed entries', () => {
    const releases = parseReleases([
      githubRelease('0.3.0', { draft: true }),
      githubRelease('0.2.0', { tag_name: 'nightly' }),
      { tag_name: 42 },
      null,
      githubRelease('0.1.0'),
    ])
    expect(releases.map((r) => r.version)).toEqual(['0.1.0'])
  })

  it('drops assets that do not download from github.com', () => {
    const [release] = parseReleases([
      githubRelease('0.3.0', {
        assets: [
          {
            name: 'Orbit.dmg',
            size: 1,
            browser_download_url: 'https://evil.example/x.dmg',
          },
          {
            name: 'Orbit-0.3.0-aarch64.dmg',
            size: 1,
            browser_download_url:
              'https://github.com/LFSCamargo/orbit/releases/download/v0.3.0/Orbit-0.3.0-aarch64.dmg',
          },
        ],
      }),
    ])
    expect(release.assets.map((a) => a.name)).toEqual(['Orbit-0.3.0-aarch64.dmg'])
  })

  it('returns an empty list for a non-array payload', () => {
    expect(parseReleases({ message: 'API rate limit exceeded' })).toEqual([])
  })
})

describe('latestStable and findRelease', () => {
  const releases = parseReleases([
    githubRelease('0.4.0-beta.1', { prerelease: true }),
    githubRelease('0.3.0'),
    githubRelease('0.2.0'),
  ])

  it('skips prereleases when picking the latest', () => {
    expect(latestStable(releases)?.version).toBe('0.3.0')
  })

  it('finds a release by version', () => {
    expect(findRelease(releases, '0.2.0')?.tag).toBe('v0.2.0')
    expect(findRelease(releases, '9.9.9')).toBeUndefined()
  })
})

describe('primaryDownload', () => {
  it('prefers the Apple Silicon DMG', () => {
    const [release] = parseReleases([githubRelease('0.3.0')])
    expect(primaryDownload(release)?.name).toBe('Orbit-0.3.0-aarch64.dmg')
  })

  it('selects Windows and Linux installers independently', () => {
    const [release] = parseReleases([
      githubRelease('0.3.0', {
        assets: [
          {
            name: 'Orbit-0.3.0-x64-setup.exe',
            size: 1,
            browser_download_url:
              'https://github.com/LFSCamargo/orbit/releases/download/v0.3.0/Orbit-0.3.0-x64-setup.exe',
          },
          {
            name: 'Orbit-0.3.0-amd64.AppImage',
            size: 1,
            browser_download_url:
              'https://github.com/LFSCamargo/orbit/releases/download/v0.3.0/Orbit-0.3.0-amd64.AppImage',
          },
        ],
      }),
    ])
    expect(primaryDownload(release, 'windows')?.kind).toBe('exe')
    expect(primaryDownload(release, 'linux')?.kind).toBe('appimage')
    expect(primaryDownload(release, 'macos')).toBeUndefined()
  })

  it('falls back to the app archive when no DMG exists', () => {
    const [release] = parseReleases([
      githubRelease('0.1.0', {
        assets: [
          {
            name: 'Orbit-0.1.0-aarch64.app.tar.gz',
            size: 1,
            browser_download_url:
              'https://github.com/LFSCamargo/orbit/releases/download/v0.1.0/Orbit-0.1.0-aarch64.app.tar.gz',
          },
        ],
      }),
    ])
    expect(primaryDownload(release)?.kind).toBe('app-archive')
  })
})
