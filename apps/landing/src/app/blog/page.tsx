import type { Metadata } from 'next'
import { BlogList } from '@/components/blog/BlogList'
import { PageHero } from '@/components/layout/PageHero'
import { NewspaperIcon, RssIcon } from '@/components/ui/icons'
import { POSTS } from '@/content/blog/posts'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Blog',
    description:
      'Product stories, engineering notes and launch updates from the Orbit team: building a controller-first game launcher for the Mac.',
    path: '/blog',
  }),
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Orbit Blog' }] },
  },
}

export default function BlogPage() {
  return (
    <>
      <PageHero
        eyebrow="Orbit Blog"
        icon={<NewspaperIcon className="h-4 w-4" />}
        title="Building the future of"
        highlight="Mac gaming."
        description="Product stories, engineering notes, and launch updates from the Orbit team."
      >
        <a
          href="/blog/rss.xml"
          className="mt-8 inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-orbit-accent"
        >
          <RssIcon className="h-4 w-4" />
          Subscribe with RSS
        </a>
      </PageHero>
      <BlogList posts={POSTS} />
    </>
  )
}
