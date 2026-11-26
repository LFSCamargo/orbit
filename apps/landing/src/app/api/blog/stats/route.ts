import { NextResponse } from 'next/server'
import { POSTS } from '@/content/blog/posts'
import { readStats } from '@/lib/blog/stats'

export const dynamic = 'force-dynamic'

/** View counts for every post, for the blog index. */
export async function GET() {
  const entries = await Promise.all(
    POSTS.map(async (post) => [post.slug, (await readStats(post.slug)).views] as const),
  )
  return NextResponse.json(Object.fromEntries(entries), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
