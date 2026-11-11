import { formatBytes } from '@/lib/format'
import { archLabel } from '@/lib/labels'
import { primaryDownload, type AssetPlatform, type Release } from '@/lib/releases'
import { RELEASES_URL } from '@/lib/site'

const PLATFORM_LABELS: Record<AssetPlatform, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
}

interface DownloadButtonProps {
  release: Release | undefined
  platform?: AssetPlatform
  compact?: boolean
}

export function DownloadButton({
  release,
  platform = 'macos',
  compact = false,
}: DownloadButtonProps) {
  const asset = release ? primaryDownload(release, platform) : undefined
  const platformLabel = PLATFORM_LABELS[platform]

  if (!release || !asset) {
    return (
      <a
        href={release?.htmlUrl || RELEASES_URL}
        className="inline-flex items-center justify-center rounded-full bg-orbit-accent px-6 py-3 text-sm font-semibold text-orbit-canvas transition hover:bg-orbit-focus"
      >
        Get Orbit for {platformLabel} on GitHub
      </a>
    )
  }

  const details = [
    `v${release.version}`,
    archLabel(asset.arch, asset.platform),
    formatBytes(asset.size),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <a
      href={asset.url}
      className={`inline-flex ${compact ? 'items-center justify-center rounded-full px-5 py-3 text-sm' : 'flex-col rounded-full px-7 py-3'} bg-orbit-accent text-orbit-canvas transition hover:bg-orbit-focus`}
    >
      <span className="font-semibold">Download for {platformLabel}</span>
      {!compact && <span className="text-xs opacity-80">{details}</span>}
    </a>
  )
}
