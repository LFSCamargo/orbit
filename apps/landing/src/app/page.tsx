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
import { JsonLd } from '@/components/seo/JsonLd'
import { fetchLatestRelease } from '@/lib/github'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/seo'
import { GITHUB_URL } from '@/lib/site'

export const revalidate = 120

export default async function HomePage() {
  const latest = await fetchLatestRelease()

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: SITE_NAME,
            description: SITE_DESCRIPTION,
            url: SITE_URL,
            applicationCategory: 'GameApplication',
            operatingSystem: 'macOS 12 or later (Apple silicon)',
            image: absoluteUrl('/opengraph-image'),
            ...(latest
              ? { softwareVersion: latest.version, downloadUrl: absoluteUrl('/download') }
              : {}),
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            codeRepository: GITHUB_URL,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: SITE_URL,
          },
        ]}
      />
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
