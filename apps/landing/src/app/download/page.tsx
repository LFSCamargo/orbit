import type { Metadata } from 'next'
import { ReleasesUnavailable } from '@/components/download/ReleasesUnavailable'
import { ReleaseView } from '@/components/download/ReleaseView'
import { fetchReleases } from '@/lib/github'
import { latestStable } from '@/lib/releases'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Download',
  description:
    'Download the latest Orbit release for macOS, Windows, or Linux, or choose an earlier version.',
}

export default async function DownloadPage() {
  const releases = await fetchReleases()
  const latest = releases ? latestStable(releases) : undefined

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      {releases && latest ? (
        <ReleaseView releases={releases} release={latest} />
      ) : (
        <ReleasesUnavailable />
      )}
    </div>
  )
}
