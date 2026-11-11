import type { AssetArch, AssetKind, AssetPlatform, ReleaseAsset } from './releases'

const KIND_LABELS: Record<Exclude<AssetKind, 'other'>, string> = {
  dmg: 'macOS disk image',
  'app-archive': 'macOS app archive',
  exe: 'Windows installer',
  msi: 'Windows MSI installer',
  appimage: 'Linux AppImage',
  deb: 'Debian / Ubuntu package',
  rpm: 'Fedora / RHEL package',
  'linux-archive': 'Linux archive',
  checksums: 'SHA-256 checksums',
}

export function archLabel(
  arch: AssetArch | null,
  platform: AssetPlatform | null = 'macos',
): string | null {
  if (!arch) return null
  if (arch === 'universal') return 'Universal'
  if (platform === 'macos') return arch === 'arm64' ? 'Apple Silicon' : 'Intel'
  return arch === 'arm64' ? 'ARM64' : 'x86-64'
}

export function assetLabel(asset: ReleaseAsset): string {
  if (asset.kind === 'other') return asset.name
  const kind = KIND_LABELS[asset.kind]
  const arch = archLabel(asset.arch, asset.platform)
  return arch ? `${kind} · ${arch}` : kind
}
