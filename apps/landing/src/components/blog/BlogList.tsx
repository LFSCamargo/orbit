'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRightIcon, ClockIcon } from '@/components/ui/icons'
import { formatReleaseDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { POST_KIND_LABELS, type PostKind, type PostMeta } from '@/content/blog/posts'
import { BlogViewCount } from './BlogViewCount'

type Filter = 'all' | PostKind

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All posts' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'article', label: 'Articles' },
]

function PostDetails({ post }: { post: PostMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
      <time dateTime={post.date}>{formatReleaseDate(post.date)}</time>
      <span className="inline-flex items-center gap-1.5">
        <ClockIcon className="h-3.5 w-3.5" />
        {post.readingMinutes} min read
      </span>
      <BlogViewCount slug={post.slug} />
    </div>
  )
}

function KindBadge({ kind }: { kind: PostKind }) {
  return (
    <span
      className={cn(
        'self-start rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]',
        kind === 'announcement'
          ? 'border-orange-400/50 bg-orange-500/10 text-orange-200'
          : 'border-white/15 bg-white/[0.04] text-white/70',
      )}
    >
      {POST_KIND_LABELS[kind]}
    </span>
  )
}

/** The newest post as a large card, the rest in a grid, filtered by kind. */
export function BlogList({ posts }: { posts: PostMeta[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = posts.filter((post) => filter === 'all' || post.kind === filter)
  const [featured, ...rest] = shown

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-12">
      <div role="group" aria-label="Filter posts" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orbit-focus',
              filter === item.id
                ? 'orbit-btn-fire'
                : 'orbit-glass text-white/75 hover:text-white',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!featured ? (
        <p className="mt-10 text-orbit-muted">No posts here yet.</p>
      ) : (
        <>
          <Link
            href={`/blog/${featured.slug}`}
            className="orbit-glass group relative mt-8 block overflow-hidden rounded-[28px] p-8 transition hover:-translate-y-1 sm:p-10"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_120_50/0.35),transparent)] blur-2xl transition group-hover:scale-110"
            />
            <div className="relative flex flex-wrap items-center gap-3">
              <KindBadge kind={featured.kind} />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-orbit-accent">
                Latest
              </span>
            </div>
            <h2 className="relative mt-5 max-w-3xl text-3xl font-medium tracking-[-0.035em] text-orbit-foreground sm:text-4xl">
              {featured.title}
            </h2>
            <p className="relative mt-4 max-w-2xl text-base leading-7 text-white/70">
              {featured.description}
            </p>
            <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4">
              <PostDetails post={featured} />
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-orbit-accent">
                Read the post
                <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          {rest.length > 0 && (
            <ul className="mt-6 grid gap-6 sm:grid-cols-2">
              {rest.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="orbit-glass group flex h-full flex-col rounded-[24px] p-7 transition hover:-translate-y-1"
                  >
                    <KindBadge kind={post.kind} />
                    <h2 className="mt-4 text-xl font-medium tracking-[-0.02em] text-orbit-foreground">
                      {post.title}
                    </h2>
                    <p className="mt-3 flex-1 text-sm leading-6 text-white/65">
                      {post.description}
                    </p>
                    <div className="mt-6">
                      <PostDetails post={post} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
