import { DownloadMac } from '@/components/download/DownloadMac'
import { DemoSection } from '@/components/home/DemoSection'
import { ControllerSection } from '@/components/home/ControllerSection'
import { FaqSection } from '@/components/home/FaqSection'
import { FeatureGrid } from '@/components/home/FeatureGrid'
import { GameWall } from '@/components/home/GameWall'
import { Hero } from '@/components/home/Hero'
import { SourcesSection } from '@/components/home/SourcesSection'
import { ThemesSection } from '@/components/home/ThemesSection'
import { WhyOrbitSection } from '@/components/home/WhyOrbitSection'
import { fetchReleases } from '@/lib/github'
import { latestStable } from '@/lib/releases'

export const revalidate = 600

export default async function HomePage() {
  const releases = await fetchReleases()
  const latest = releases ? latestStable(releases) : undefined

  return (
    <>
      <Hero latest={latest} />
      <GameWall />
      <DemoSection />
      <FeatureGrid />
      <SourcesSection />
      <ThemesSection />
      <ControllerSection />
      <WhyOrbitSection />
      <DownloadMac latest={latest} />
      <FaqSection />
    </>
  )
}
