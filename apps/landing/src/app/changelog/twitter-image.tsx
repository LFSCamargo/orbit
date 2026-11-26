import { changelogCard } from '@/og/changelogCard'
import { getChangelog } from '@/lib/changelogSource'

export const alt = 'Orbit changelog — every release, explained.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const [latest] = await getChangelog()
  return changelogCard(latest)
}
