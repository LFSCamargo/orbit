/** Orbit ships for macOS only: a disk image, an app archive, and checksums.
 * Other files on a release (older Windows/Linux builds) are not offered. */
export type AssetKind = 'dmg' | 'app-archive' | 'checksums'
export type AssetArch = 'arm64' | 'x64' | 'universal'

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  kind: AssetKind
  arch: AssetArch | null
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

/** The macOS file a release asset is, or null when it is not one. */
export function classifyAsset(name: string): Pick<ReleaseAsset, 'kind' | 'arch'> | null {
  const lowerName = name.toLowerCase()
  const arch = detectArch(lowerName)
  if (/sha256sums/i.test(lowerName)) return { kind: 'checksums', arch: null }
  if (lowerName.endsWith('.dmg')) return { kind: 'dmg', arch }
  if (lowerName.endsWith('.app.tar.gz')) return { kind: 'app-archive', arch }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseAsset(raw: unknown): ReleaseAsset | null {
  if (!isRecord(raw)) return null
  const { name, browser_download_url: url, size } = raw
  if (typeof name !== 'string' || typeof url !== 'string') return null
  if (!url.startsWith(DOWNLOAD_HOST)) return null
  const kind = classifyAsset(name)
  if (!kind) return null
  return { name, url, size: typeof size === 'number' ? size : 0, ...kind }
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

const DOWNLOAD_PRIORITY: AssetKind[] = ['dmg', 'app-archive']
const ARCH_PRIORITY: Array<AssetArch | null> = ['arm64', 'universal', 'x64', null]

/** The file "Download for Mac" points at: the Apple Silicon disk image first. */
export function primaryDownload(release: Release): ReleaseAsset | undefined {
  for (const kind of DOWNLOAD_PRIORITY) {
    for (const arch of ARCH_PRIORITY) {
      const match = release.assets.find(
        (asset) => asset.kind === kind && (arch === null || asset.arch === arch),
      )
      if (match) return match
    }
  }
  return undefined
}
