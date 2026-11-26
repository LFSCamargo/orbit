import { POSTS } from '@/content/blog/posts'
import { SITE_NAME, absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-static'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS 2.0 feed of every post, newest first. */
export function GET() {
  const items = POSTS.map((post) => {
    const url = absoluteUrl(`/blog/${post.slug}`)
    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${url}</link>`,
      `<guid isPermaLink="true">${url}</guid>`,
      `<description>${escapeXml(post.description)}</description>`,
      `<pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>`,
      ...post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`),
      '</item>',
    ].join('')
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${SITE_NAME} Blog</title><link>${absoluteUrl('/blog')}</link><description>Product stories, engineering notes and launch updates from the Orbit team.</description><language>en-us</language><atom:link href="${absoluteUrl('/blog/rss.xml')}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
