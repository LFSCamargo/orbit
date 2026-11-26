import type { Metadata } from 'next'
import { ReleasesUnavailable } from '@/components/download/ReleasesUnavailable'
import { ReleaseView } from '@/components/download/ReleaseView'
import { fetchReleases } from '@/lib/github'
import { latestStable } from '@/lib/releases'
import { pageMetadata } from '@/lib/seo'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: 'Download',
  description:
    'Download the latest Orbit release for your Mac, or choose an earlier version.',
  path: '/download',
})

export default async function DownloadPage() {
  const releases = await fetchReleases()
  const latest = releases ? latestStable(releases) : undefined

  return (
    <div className="mx-auto max-w-5xl px-6 pb-20 pt-32">
      {releases && latest ? (
        <ReleaseView releases={releases} release={latest} />
      ) : (
        <ReleasesUnavailable />
      )}
    </div>
  )
}
