import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  PostReactions,
  PostStatsProvider,
  PostViewCount,
} from '@/components/blog/PostStats'
import { JsonLd } from '@/components/seo/JsonLd'
import { ShareBar } from '@/components/share/ShareBar'
import { ArrowLeftIcon, ArrowRightIcon, ClockIcon } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/reveal'
import { loadPostBody } from '@/content/blog/load'
import { POSTS, POST_KIND_LABELS, findPost } from '@/content/blog/posts'
import { formatReleaseDate } from '@/lib/format'
import { SITE_NAME, absoluteUrl, pageMetadata } from '@/lib/seo'

export const dynamicParams = false

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = findPost((await params).slug)
  if (!post) return {}
  return pageMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: 'article',
    publishedTime: post.date,
    authors: [post.author],
    tags: post.tags,
  })
}

export default async function BlogPostPage({ params }: Props) {
  const post = findPost((await params).slug)
  if (!post) notFound()
  const Body = await loadPostBody(post.slug)
  const url = absoluteUrl(`/blog/${post.slug}`)
  const index = POSTS.indexOf(post)
  const newer = POSTS[index - 1]
  const older = POSTS[index + 1]

  return (
    <PostStatsProvider slug={post.slug}>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            author: { '@type': 'Organization', name: post.author },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              logo: {
                '@type': 'ImageObject',
                url: absoluteUrl('/assets/orbit-app-icon.png'),
              },
            },
            image: absoluteUrl(`/blog/${post.slug}/opengraph-image`),
            mainEntityOfPage: url,
            keywords: post.tags.join(', '),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Blog',
                item: absoluteUrl('/blog'),
              },
              { '@type': 'ListItem', position: 2, name: post.title, item: url },
            ],
          },
        ]}
      />
      <article className="relative px-6 pb-24 pt-32 sm:pt-40">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_110_40/0.16),transparent_70%)]"
        />
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-orbit-accent"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              All posts
            </Link>
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-orbit-accent">
              {POST_KIND_LABELS[post.kind]} · {post.tags.join(' · ')}
            </p>
            <h1 className="mt-4 text-[clamp(2.3rem,5vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.045em]">
              {post.title}
            </h1>
            <p className="mt-5 text-lg leading-8 text-white/70">{post.description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/10 py-4 text-sm text-white/60">
              <span>{post.author}</span>
              <time dateTime={post.date}>{formatReleaseDate(post.date)}</time>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4" />
                {post.readingMinutes} min read
              </span>
              <PostViewCount />
            </div>
          </Reveal>

          <div className="mt-6">
            <Body />
          </div>

          <footer className="orbit-glass mt-16 flex flex-col gap-8 rounded-[24px] p-6 sm:p-8">
            <PostReactions />
            <ShareBar url={url} title={post.title} label="Share this post" />
          </footer>

          {(newer || older) && (
            <nav aria-label="More posts" className="mt-10 grid gap-4 sm:grid-cols-2">
              {older ? (
                <Link
                  href={`/blog/${older.slug}`}
                  className="orbit-glass group rounded-[20px] p-5 transition hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                    <ArrowLeftIcon className="h-3.5 w-3.5" /> Previous
                  </span>
                  <span className="mt-2 block text-orbit-foreground">{older.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {newer && (
                <Link
                  href={`/blog/${newer.slug}`}
                  className="orbit-glass group rounded-[20px] p-5 text-right transition hover:-translate-y-0.5"
                >
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                    Next <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="mt-2 block text-orbit-foreground">{newer.title}</span>
                </Link>
              )}
            </nav>
          )}
        </div>
      </article>
    </PostStatsProvider>
  )
}
