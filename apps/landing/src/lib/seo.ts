import type { Metadata } from 'next'

export const SITE_URL = 'https://orbit.thelittleluiz.me'
export const SITE_NAME = 'Orbit'
export const SITE_DESCRIPTION =
  'Orbit is a controller-first game launcher for macOS. Bring Steam, Windows games and Mac apps together, play Windows games through Orbit Wine, and get from the couch to playing in seconds.'

/** Absolute URL for a site path. */
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
    alternates: { canonical: path },
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
