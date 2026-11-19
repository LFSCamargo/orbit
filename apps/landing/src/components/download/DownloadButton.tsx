import { formatBytes } from '@/lib/format'
import { archLabel } from '@/lib/labels'
import { primaryDownload, type Release } from '@/lib/releases'
import { RELEASES_URL } from '@/lib/site'
import { buttonClass } from '@/components/ui/button'
import { AppleIcon } from './AppleIcon'

interface DownloadButtonProps {
  release: Release | undefined
  compact?: boolean
}

/** "Download for Mac": the release's Apple Silicon disk image, with its
 * version, architecture and size; GitHub when there is no Mac file. */
export function DownloadButton({ release, compact = false }: DownloadButtonProps) {
  const asset = release ? primaryDownload(release) : undefined

  if (!release || !asset) {
    return (
      <a
        href={release?.htmlUrl || RELEASES_URL}
        className={buttonClass({ size: compact ? 'md' : 'lg' })}
      >
        <AppleIcon />
        Get Orbit for Mac on GitHub
      </a>
    )
  }

  const details = [`v${release.version}`, archLabel(asset.arch), formatBytes(asset.size)]
    .filter(Boolean)
    .join(' · ')

  return (
    <a
      href={asset.url}
      className={buttonClass({
        size: compact ? 'md' : 'lg',
        className: compact ? undefined : 'py-2.5',
      })}
    >
      <AppleIcon />
      <span className="flex flex-col items-start leading-tight">
        <span>Download for Mac</span>
        {!compact && <span className="text-xs font-medium text-white/80">{details}</span>}
      </span>
    </a>
  )
}
