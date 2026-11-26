import type { MetadataRoute } from 'next'
import { POSTS } from '@/content/blog/posts'
import { getChangelog } from '@/lib/changelogSource'
import { fetchReleases } from '@/lib/github'
import { absoluteUrl } from '@/lib/seo'

export const revalidate = 3600

/** Every public page, for search engines. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [changelog, releases] = await Promise.all([getChangelog(), fetchReleases()])
  const latestDate = changelog[0]?.date ? new Date(changelog[0].date) : undefined
  return [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
      lastModified: latestDate,
    },
    { url: absoluteUrl('/install'), changeFrequency: 'monthly', priority: 0.9 },
    {
      url: absoluteUrl('/download'),
      changeFrequency: 'weekly',
      priority: 0.9,
      lastModified: latestDate,
    },
    { url: absoluteUrl('/docs'), changeFrequency: 'monthly', priority: 0.7 },
    {
      url: absoluteUrl('/changelog'),
      changeFrequency: 'weekly',
      priority: 0.8,
      lastModified: latestDate,
    },
    { url: absoluteUrl('/blog'), changeFrequency: 'weekly', priority: 0.8 },
    ...POSTS.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: new Date(post.date),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...changelog.map((release) => ({
      url: absoluteUrl(`/changelog/${release.version}`),
      lastModified: release.date ? new Date(release.date) : undefined,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    })),
    ...(releases ?? []).map((release) => ({
      url: absoluteUrl(`/download/${release.version}`),
      lastModified: release.publishedAt ? new Date(release.publishedAt) : undefined,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
  ]
}
