import { renderOgCard, shorten } from '@/og/card'
import { POSTS, POST_KIND_LABELS, findPost, titleParts } from '@/content/blog/posts'
import { formatReleaseDate } from '@/lib/format'

export const alt = 'A post from the Orbit Blog.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamicParams = false

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = findPost((await params).slug)
  if (!post) {
    return renderOgCard({
      variant: 'blog',
      eyebrow: 'Orbit Blog',
      title: [[{ text: 'Orbit Blog' }]],
    })
  }
  return renderOgCard({
    variant: 'blog',
    eyebrow: post.kind === 'announcement' ? 'Orbit Announcement' : 'Orbit Blog',
    title: [titleParts(post)],
    subtitle: shorten(post.description, 110),
    badges: [
      { label: POST_KIND_LABELS[post.kind] },
      { label: formatReleaseDate(post.date) ?? post.date },
      { label: `${post.readingMinutes} min read` },
    ],
  })
}
