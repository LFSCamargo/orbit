import { NextResponse, type NextRequest } from 'next/server'
import { findPost } from '@/content/blog/posts'
import {
  REACTIONS,
  isReaction,
  readStats,
  recordView,
  setReaction,
  type PostStats,
  type Reaction,
} from '@/lib/blog/stats'

export const dynamic = 'force-dynamic'

const VIEW_WINDOW_SECONDS = 6 * 60 * 60
const REACTIONS_MAX_AGE = 365 * 24 * 60 * 60

/** Cookie names are per post: `ov_<slug>` (recently viewed) and
 * `or_<slug>` (this browser's reactions). Slugs come from POSTS only. */
const viewCookie = (slug: string) => `ov_${slug}`
const reactionCookie = (slug: string) => `or_${slug}`

function myReactions(request: NextRequest, slug: string): Reaction[] {
  const raw = request.cookies.get(reactionCookie(slug))?.value ?? ''
  return raw.split('.').filter(isReaction)
}

function respond(stats: PostStats, mine: Reaction[]) {
  return NextResponse.json({ stats, mine }, { headers: { 'Cache-Control': 'no-store' } })
}

type Context = { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params
  if (!findPost(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return respond(await readStats(slug), myReactions(request, slug))
}

/** `{ action: 'view' }` counts a read (once per browser every six hours);
 * `{ action: 'react', reaction, active }` adds or removes this browser's reaction. */
export async function POST(request: NextRequest, { params }: Context) {
  const { slug } = await params
  if (!findPost(slug)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: { action?: unknown; reaction?: unknown; active?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const mine = myReactions(request, slug)

  if (body.action === 'view') {
    if (request.cookies.get(viewCookie(slug))) return respond(await readStats(slug), mine)
    const response = respond(await recordView(slug), mine)
    response.cookies.set(viewCookie(slug), '1', {
      maxAge: VIEW_WINDOW_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
    return response
  }

  if (
    body.action === 'react' &&
    isReaction(body.reaction) &&
    typeof body.active === 'boolean'
  ) {
    const reaction = body.reaction
    const already = mine.includes(reaction)
    if (already === body.active) return respond(await readStats(slug), mine)
    const next = body.active
      ? [...mine, reaction]
      : mine.filter((item) => item !== reaction)
    const response = respond(await setReaction(slug, reaction, body.active), next)
    response.cookies.set(
      reactionCookie(slug),
      REACTIONS.filter((r) => next.includes(r)).join('.'),
      {
        maxAge: REACTIONS_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    )
    return response
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
