import Link from 'next/link'
import { formatReleaseDate } from '@/lib/format'
import type { Release } from '@/lib/releases'
import { Badge } from './Badge'

interface VersionListProps {
  releases: Release[]
  current: string
  latest: string | undefined
}

export function VersionList({ releases, current, latest }: VersionListProps) {
  return (
    <ul className="space-y-1">
      {releases.map((release) => {
        const active = release.version === current
        return (
          <li key={release.version}>
            <Link
              href={`/download/${release.version}`}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center justify-between gap-3 rounded-full px-4 py-2 text-sm transition ${
                active
                  ? 'bg-orbit-panel text-orbit-foreground'
                  : 'text-orbit-muted hover:text-orbit-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                v{release.version}
                {release.version === latest && <Badge>Latest</Badge>}
                {release.prerelease && <Badge>Pre-release</Badge>}
              </span>
              <span className="text-xs">{formatReleaseDate(release.publishedAt)}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
