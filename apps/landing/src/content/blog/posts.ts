/** Every blog post, newest first. The article body is the MDX file with the
 * same slug next to this file. */

export type PostKind = 'announcement' | 'article'

export interface PostMeta {
  slug: string
  title: string
  /** The part of the title the social card paints with Orbit's fire. */
  highlight?: string
  description: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  kind: PostKind
  author: string
  tags: string[]
  readingMinutes: number
}

export const POST_KIND_LABELS: Record<PostKind, string> = {
  announcement: 'Announcement',
  article: 'Article',
}

export const POSTS: PostMeta[] = [
  {
    slug: 'orbit-2-6-compressed-games-and-controllers',
    title: 'Orbit 2.6: compressed games and controllers that keep up',
    highlight: 'compressed games',
    description:
      'APFS compression gives you back disk space without changing how games run, 2.4 GHz receivers work in games, input lag and dropouts are down, shaders load before you play, and Mac versions come first.',
    date: '2026-11-27',
    kind: 'announcement',
    author: 'The Orbit team',
    tags: ['Release', 'Storage', 'Controllers', 'Steam'],
    readingMinutes: 6,
  },
  {
    slug: 'from-2-0-to-2-5',
    title: 'From 2.0 to 2.5: how Windows games came home to the Mac',
    highlight: 'came home to the Mac',
    description:
      'Everything Orbit learned since its first compatibility layers: Orbit Wine containers, Xbox Cloud Gaming, DLSS-class upscaling and frame generation, and the 2.5.0 release that makes it all lighter and quieter.',
    date: '2026-11-25',
    kind: 'announcement',
    author: 'The Orbit team',
    tags: ['Release', 'Wine', 'Steam', 'Graphics'],
    readingMinutes: 8,
  },
  {
    slug: 'introducing-the-orbit-blog',
    title: 'Introducing the Orbit blog',
    highlight: 'Orbit blog',
    description:
      'A new home for Orbit announcements, release stories and engineering notes, alongside a detailed changelog for every version.',
    date: '2026-11-25',
    kind: 'announcement',
    author: 'The Orbit team',
    tags: ['Announcement'],
    readingMinutes: 2,
  },
]

export function findPost(slug: string): PostMeta | undefined {
  return POSTS.find((post) => post.slug === slug)
}

/** Title split for the social card: plain text with the highlight in fire. */
export function titleParts(post: PostMeta): { text: string; highlight?: boolean }[] {
  if (!post.highlight) return [{ text: post.title }]
  const index = post.title.indexOf(post.highlight)
  if (index < 0) return [{ text: post.title }]
  return [
    { text: post.title.slice(0, index) },
    { text: post.highlight, highlight: true },
    { text: post.title.slice(index + post.highlight.length) },
  ].filter((part) => part.text)
}
