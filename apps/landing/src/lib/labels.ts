import type { AssetArch, AssetKind, ReleaseAsset } from './releases'

const KIND_LABELS: Record<AssetKind, string> = {
  dmg: 'macOS disk image',
  'app-archive': 'macOS app archive',
  checksums: 'SHA-256 checksums',
}

export function archLabel(arch: AssetArch | null): string | null {
  if (!arch) return null
  if (arch === 'universal') return 'Universal'
  return arch === 'arm64' ? 'Apple Silicon' : 'Intel'
}

export function assetLabel(asset: ReleaseAsset): string {
  const arch = archLabel(asset.arch)
  return arch ? `${KIND_LABELS[asset.kind]} · ${arch}` : KIND_LABELS[asset.kind]
}
