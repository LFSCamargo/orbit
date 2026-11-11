import { DownloadPlatforms } from '@/components/download/DownloadPlatforms'
import { ControllerSection } from '@/components/home/ControllerSection'
import { FeatureGrid } from '@/components/home/FeatureGrid'
import { Hero } from '@/components/home/Hero'
import { ThemesSection } from '@/components/home/ThemesSection'
import { fetchReleases } from '@/lib/github'
import { latestStable } from '@/lib/releases'

export const revalidate = 600

export default async function HomePage() {
  const releases = await fetchReleases()
  const latest = releases ? latestStable(releases) : undefined

  return (
    <>
      <Hero latest={latest} />
      <FeatureGrid />
      <ThemesSection />
      <ControllerSection />
      <DownloadPlatforms latest={latest} />
    </>
  )
}
