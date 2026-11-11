import Link from 'next/link'
import { formatReleaseDate } from '@/lib/format'
import { latestStable, type Release } from '@/lib/releases'
import { DownloadButton } from './DownloadButton'
import { ReleaseAssets } from './ReleaseAssets'
import { ReleaseNotes } from './ReleaseNotes'
import { VersionList } from './VersionList'
import { VersionPicker } from './VersionPicker'

interface ReleaseViewProps {
  releases: Release[]
  release: Release
}

export function ReleaseView({ releases, release }: ReleaseViewProps) {
  const latest = latestStable(releases)?.version
  const published = formatReleaseDate(release.publishedAt)
  const options = releases.map(({ version, prerelease }) => ({ version, prerelease }))

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_16rem]">
      <div className="min-w-0 space-y-10">
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold sm:text-4xl">Orbit {release.version}</h1>
              <p className="mt-1 text-orbit-muted">
                {[
                  published && `Released ${published}`,
                  release.version === latest && 'Latest stable',
                  release.prerelease && 'Pre-release',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <VersionPicker versions={options} current={release.version} />
          </div>
          <div className="flex flex-wrap gap-3">
            <DownloadButton release={release} platform="macos" compact />
            <DownloadButton release={release} platform="windows" compact />
            <DownloadButton release={release} platform="linux" compact />
          </div>
          <p className="text-sm text-orbit-muted">
            Available for macOS, Windows, and Linux. First time installing?{' '}
            <Link href="/install" className="text-orbit-accent hover:underline">
              Read the install guide
            </Link>
            .
          </p>
        </section>

        <section aria-labelledby="files-heading" className="space-y-4">
          <h2 id="files-heading" className="text-xl font-semibold">
            Files
          </h2>
          <ReleaseAssets assets={release.assets} />
        </section>

        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="text-xl font-semibold">
            Release notes
          </h2>
          <ReleaseNotes markdown={release.notes} />
          {release.htmlUrl && (
            <p className="mt-6 text-sm">
              <a href={release.htmlUrl} className="text-orbit-accent hover:underline">
                View this release on GitHub
              </a>
            </p>
          )}
        </section>
      </div>

      <aside
        aria-labelledby="versions-heading"
        className="lg:sticky lg:top-24 lg:self-start"
      >
        <h2
          id="versions-heading"
          className="mb-3 px-4 text-sm font-semibold text-orbit-muted"
        >
          All versions
        </h2>
        <VersionList releases={releases} current={release.version} latest={latest} />
      </aside>
    </div>
  )
}
