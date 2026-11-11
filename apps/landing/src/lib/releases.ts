export type AssetPlatform = 'macos' | 'windows' | 'linux'
export type AssetKind =
  | 'dmg'
  | 'app-archive'
  | 'exe'
  | 'msi'
  | 'appimage'
  | 'deb'
  | 'rpm'
  | 'linux-archive'
  | 'checksums'
  | 'other'
export type AssetArch = 'arm64' | 'x64' | 'universal'

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  kind: AssetKind
  arch: AssetArch | null
  platform: AssetPlatform | null
}

export interface Release {
  version: string
  tag: string
  name: string
  notes: string
  publishedAt: string | null
  prerelease: boolean
  htmlUrl: string
  assets: ReleaseAsset[]
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const DOWNLOAD_HOST = 'https://github.com/'

export function isValidVersion(version: string): boolean {
  return SEMVER_RE.test(version)
}

export function compareVersions(a: string, b: string): number {
  const pa = a.match(SEMVER_RE)
  const pb = b.match(SEMVER_RE)
  if (!pa || !pb) return a.localeCompare(b)

  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff !== 0) return diff
  }

  const preA = pa[4]
  const preB = pb[4]
  if (preA === preB) return 0
  if (!preA) return 1
  if (!preB) return -1
  return preA.localeCompare(preB, 'en', { numeric: true })
}

function detectArch(name: string): AssetArch | null {
  if (/aarch64|arm64/i.test(name)) return 'arm64'
  if (/x86_64|x64|intel|amd64/i.test(name)) return 'x64'
  if (/universal/i.test(name)) return 'universal'
  return null
}

export function classifyAsset(
  name: string,
): Pick<ReleaseAsset, 'kind' | 'arch' | 'platform'> {
  const lowerName = name.toLowerCase()
  const arch = detectArch(lowerName)
  if (/sha256sums/i.test(lowerName)) {
    return { kind: 'checksums', arch: null, platform: null }
  }
  if (lowerName.endsWith('.dmg')) return { kind: 'dmg', arch, platform: 'macos' }
  if (lowerName.endsWith('.app.tar.gz')) {
    return { kind: 'app-archive', arch, platform: 'macos' }
  }
  if (lowerName.endsWith('.exe')) return { kind: 'exe', arch, platform: 'windows' }
  if (lowerName.endsWith('.msi')) return { kind: 'msi', arch, platform: 'windows' }
  if (lowerName.endsWith('.appimage'))
    return { kind: 'appimage', arch, platform: 'linux' }
  if (lowerName.endsWith('.deb')) return { kind: 'deb', arch, platform: 'linux' }
  if (lowerName.endsWith('.rpm')) return { kind: 'rpm', arch, platform: 'linux' }
  if (/\.(?:tar\.gz|tgz|tar\.xz|zip)$/.test(lowerName)) {
    return { kind: 'linux-archive', arch, platform: 'linux' }
  }
  return { kind: 'other', arch: null, platform: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseAsset(raw: unknown): ReleaseAsset | null {
  if (!isRecord(raw)) return null
  const { name, browser_download_url: url, size } = raw
  if (typeof name !== 'string' || typeof url !== 'string') return null
  if (!url.startsWith(DOWNLOAD_HOST)) return null
  return {
    name,
    url,
    size: typeof size === 'number' ? size : 0,
    ...classifyAsset(name),
  }
}

function parseRelease(raw: unknown): Release | null {
  if (!isRecord(raw) || raw.draft === true) return null
  const tag = raw.tag_name
  if (typeof tag !== 'string') return null

  const version = tag.replace(/^v/, '')
  if (!isValidVersion(version)) return null

  const assets = Array.isArray(raw.assets) ? raw.assets : []
  return {
    version,
    tag,
    name: typeof raw.name === 'string' && raw.name ? raw.name : `Orbit ${version}`,
    notes: typeof raw.body === 'string' ? raw.body : '',
    publishedAt: typeof raw.published_at === 'string' ? raw.published_at : null,
    prerelease: raw.prerelease === true,
    htmlUrl: typeof raw.html_url === 'string' ? raw.html_url : '',
    assets: assets.map(parseAsset).filter((a): a is ReleaseAsset => a !== null),
  }
}

/** Validates an untrusted GitHub Releases API payload. O(n log n) for n releases. */
export function parseReleases(payload: unknown): Release[] {
  if (!Array.isArray(payload)) return []
  return payload
    .map(parseRelease)
    .filter((r): r is Release => r !== null)
    .sort((a, b) => compareVersions(b.version, a.version))
}

export function latestStable(releases: Release[]): Release | undefined {
  return releases.find((r) => !r.prerelease) ?? releases[0]
}

export function findRelease(releases: Release[], version: string): Release | undefined {
  return releases.find((r) => r.version === version)
}

const DOWNLOAD_PRIORITY: Record<AssetPlatform, AssetKind[]> = {
  macos: ['dmg', 'app-archive'],
  windows: ['exe', 'msi'],
  linux: ['appimage', 'deb', 'rpm', 'linux-archive'],
}

const ARCH_PRIORITY: Record<AssetPlatform, Array<AssetArch | null>> = {
  macos: ['arm64', 'universal', 'x64', null],
  windows: ['x64', 'arm64', null],
  linux: ['x64', 'arm64', null],
}

export function primaryDownload(
  release: Release,
  platform: AssetPlatform = 'macos',
): ReleaseAsset | undefined {
  for (const kind of DOWNLOAD_PRIORITY[platform]) {
    for (const arch of ARCH_PRIORITY[platform]) {
      const match = release.assets.find(
        (asset) =>
          asset.platform === platform &&
          asset.kind === kind &&
          (arch === null || asset.arch === arch),
      )
      if (match) return match
    }
  }
  return undefined
}
