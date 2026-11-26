import type { Metadata } from 'next'
import { PRODUCTION_URL, resolveSiteUrl } from './siteUrl'

/** Where this deployment is served (a preview's own URL, or production). */
// `process.env.ORBIT_SITE_URL` is written out so Next inlines the value
// next.config.ts resolved at build; pages regenerated later keep it.
export const SITE_URL = resolveSiteUrl({
  ...process.env,
  ORBIT_SITE_URL: process.env.ORBIT_SITE_URL,
})
/** Only the production deployment may be indexed. */
export const IS_PRODUCTION_SITE = SITE_URL === PRODUCTION_URL
export const SITE_NAME = 'Orbit'
export const SITE_DESCRIPTION =
  'Orbit is a controller-first game launcher for macOS. Bring Steam, Windows games and Mac apps together, play Windows games through Orbit Wine, and get from the couch to playing in seconds.'

/** The production URL for a site path, for canonical links and the sitemap. */
export function canonicalUrl(path = '/'): string {
  return new URL(path, PRODUCTION_URL).toString()
}

/** Absolute URL for a site path on this deployment. */
export function absoluteUrl(path = '/'): string {
  return new URL(path, SITE_URL).toString()
}

interface PageMetadataInput {
  title: string
  description: string
  path: string
  type?: 'website' | 'article'
  publishedTime?: string
  authors?: string[]
  tags?: string[]
}

/**
 * Title, description, canonical URL and the Open Graph / Twitter fields every
 * page shares. Images come from each segment's `opengraph-image` and
 * `twitter-image` files, which Next merges on top of this.
 */
export function pageMetadata({
  title,
  description,
  path,
  type = 'website',
  publishedTime,
  authors,
  tags,
}: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(path) },
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      locale: 'en_US',
      title,
      description,
      ...(type === 'article' ? { publishedTime, authors, tags } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}
