import { formatBytes } from '@/lib/format'
import { assetLabel } from '@/lib/labels'
import type { AssetKind, ReleaseAsset } from '@/lib/releases'

const KIND_ORDER: Record<AssetKind, number> = {
  dmg: 0,
  'app-archive': 1,
  exe: 2,
  msi: 3,
  appimage: 4,
  deb: 5,
  rpm: 6,
  'linux-archive': 7,
  checksums: 8,
  other: 9,
}

export function ReleaseAssets({ assets }: { assets: ReleaseAsset[] }) {
  if (assets.length === 0) {
    return <p className="text-orbit-muted">This release has no downloadable files.</p>
  }

  const ordered = [...assets].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])

  return (
    <ul className="divide-y divide-orbit-border overflow-hidden rounded-card border border-orbit-border bg-orbit-surface">
      {ordered.map((asset) => (
        <li
          key={asset.name}
          className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-medium">{assetLabel(asset)}</p>
            <p className="truncate text-sm text-orbit-muted">
              {asset.name} · <span>{formatBytes(asset.size)}</span>
            </p>
          </div>
          <a
            href={asset.url}
            aria-label={`Download ${asset.name}`}
            className="shrink-0 rounded-full border border-orbit-border px-4 py-2 text-center text-sm font-medium transition hover:border-orbit-accent hover:text-orbit-accent"
          >
            Download
          </a>
        </li>
      ))}
    </ul>
  )
}
