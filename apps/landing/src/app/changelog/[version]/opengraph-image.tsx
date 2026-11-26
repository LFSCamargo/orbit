import { changelogCard } from '@/og/changelogCard'
import { getChangelog } from '@/lib/changelogSource'

export const alt = 'An Orbit release, explained.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamicParams = false

export async function generateStaticParams() {
  return (await getChangelog()).map((release) => ({ version: release.version }))
}

export default async function Image({
  params,
}: {
  params: Promise<{ version: string }>
}) {
  const { version } = await params
  const release = (await getChangelog()).find((item) => item.version === version)
  return changelogCard(release)
}
