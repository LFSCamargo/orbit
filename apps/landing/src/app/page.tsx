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
import { fetchLatestRelease } from '@/lib/github'

export const revalidate = 120

export default async function HomePage() {
  const latest = await fetchLatestRelease()

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
