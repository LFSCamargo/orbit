import type { MetadataRoute } from 'next'
import { IS_PRODUCTION_SITE, absoluteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_SITE) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
