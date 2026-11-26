import createMDX from '@next/mdx'
import type { NextConfig } from 'next'

/** Files read at request time (changelog pages, social images) are traced into
 * the server bundle so revalidation works off the build machine too. */
const CHANGELOG_SOURCES = ['../../CHANGELOG.md', '../../.github/release-notes/**']
const OG_ASSETS = ['./src/og/assets/**']

const nextConfig: NextConfig = {
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  outputFileTracingIncludes: {
    '/changelog': [...CHANGELOG_SOURCES, ...OG_ASSETS],
    '/changelog/**': [...CHANGELOG_SOURCES, ...OG_ASSETS],
    '/sitemap.xml': CHANGELOG_SOURCES,
    '/**': OG_ASSETS,
  },
}

const withMDX = createMDX({})

export default withMDX(nextConfig)
