import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReleaseView } from '@/components/download/ReleaseView'
import { fetchReleases } from '@/lib/github'
import { findRelease, isValidVersion } from '@/lib/releases'

export const revalidate = 600

interface VersionPageProps {
  params: Promise<{ version: string }>
}

export async function generateStaticParams() {
  const releases = await fetchReleases()
  return (releases ?? []).map((release) => ({ version: release.version }))
}

export async function generateMetadata({ params }: VersionPageProps): Promise<Metadata> {
  const { version } = await params
  return {
    title: `Download Orbit ${version}`,
    description: `Download Orbit ${version} for macOS, Windows, or Linux and read its release notes.`,
  }
}

export default async function VersionPage({ params }: VersionPageProps) {
  const { version } = await params
  if (!isValidVersion(version)) notFound()

  const releases = await fetchReleases()
  const release = releases ? findRelease(releases, version) : undefined
  if (!releases || !release) notFound()

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <ReleaseView releases={releases} release={release} />
    </div>
  )
}
