import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ComponentType, SVGProps } from 'react'
import { ChangeItemView } from '@/components/changelog/ChangeItemView'
import { CommitList } from '@/components/changelog/CommitList'
import { InlineCodeText } from '@/components/changelog/InlineCodeText'
import { SectionPills } from '@/components/changelog/SectionPills'
import { JsonLd } from '@/components/seo/JsonLd'
import { ShareBar } from '@/components/share/ShareBar'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  CodeIcon,
  DownloadIcon,
  ExternalIcon,
  SparklesIcon,
} from '@/components/ui/icons'
import { Reveal } from '@/components/ui/reveal'
import { buttonClass } from '@/components/ui/button'
import { SECTION_LABELS, type SectionKind } from '@/lib/changelog'
import { getChangelog, getReleaseNotes } from '@/lib/changelogSource'
import { formatReleaseDate } from '@/lib/format'
import { fetchReleaseComparison, fetchReleases } from '@/lib/github'
import { absoluteUrl, pageMetadata } from '@/lib/seo'
import { DOCS, GITHUB_URL } from '@/lib/site'

export const revalidate = 3600
export const dynamicParams = false

export async function generateStaticParams() {
  return (await getChangelog()).map((release) => ({ version: release.version }))
}

type Props = { params: Promise<{ version: string }> }

async function findRelease(version: string) {
  const releases = await getChangelog()
  const index = releases.findIndex((release) => release.version === version)
  return index < 0 ? null : { releases, index, release: releases[index] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findRelease((await params).version)
  if (!found) return {}
  const { release } = found
  return pageMetadata({
    title: `Orbit v${release.version} release notes`,
    description:
      release.summary.replace(/`/g, '') ||
      `What changed in Orbit v${release.version}, with links to the code behind each change.`,
    path: `/changelog/${release.version}`,
    type: 'article',
    publishedTime: release.date ?? undefined,
  })
}

const SECTION_ICONS: Record<SectionKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  added: SparklesIcon,
  changed: BoltIcon,
  fixed: CheckIcon,
  removed: CodeIcon,
  other: CodeIcon,
}

const numberFormat = new Intl.NumberFormat('en-US')

export default async function ChangelogReleasePage({ params }: Props) {
  const found = await findRelease((await params).version)
  if (!found) notFound()
  const { releases, index, release } = found

  const [notes, published] = await Promise.all([
    getReleaseNotes(release.version),
    fetchReleases(),
  ])
  const publishedVersions = new Set((published ?? []).map((item) => item.version))
  const isPublished = publishedVersions.has(release.version)
  // Compare against the previous version that has a tag on GitHub.
  const previous = releases
    .slice(index + 1)
    .find((item) => publishedVersions.has(item.version))
  const comparison =
    isPublished && previous
      ? await fetchReleaseComparison(`v${previous.version}`, `v${release.version}`)
      : null

  // The release notes explain each change in more depth; CHANGELOG.md is the fallback.
  const sections = notes?.sections.length ? notes.sections : release.sections
  const newer = releases[index - 1]
  const older = releases[index + 1]
  const url = absoluteUrl(`/changelog/${release.version}`)
  const tag = `v${release.version}`

  return (
    <article className="relative px-6 pb-24 pt-32 sm:pt-40">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: `Orbit v${release.version} release notes`,
          description: release.summary,
          datePublished: release.date ?? undefined,
          mainEntityOfPage: url,
          about: {
            '@type': 'SoftwareApplication',
            name: 'Orbit',
            softwareVersion: release.version,
          },
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_110_40/0.18),transparent_70%)]"
      />
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <Link
            href="/changelog"
            className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-orbit-accent"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All releases
          </Link>
          <p className="mt-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-orbit-accent">
            <BoltIcon className="h-4 w-4" />
            Changelog · {formatReleaseDate(release.date) ?? 'Undated'}
          </p>
          <h1 className="mt-4 text-[clamp(2.6rem,6vw,4.6rem)] font-medium leading-[1] tracking-[-0.05em]">
            Orbit <span className="fire-text">v{release.version}</span>
            {index === 0 ? ' is here.' : ''}
          </h1>
          {release.summary && (
            <p className="mt-5 max-w-3xl text-lg leading-8 text-white/70">
              <InlineCodeText text={release.summary} />
            </p>
          )}
          <SectionPills
            version={release.version}
            sections={release.sections}
            className="mt-6"
          />
          <div className="mt-8 flex flex-wrap gap-3">
            {isPublished ? (
              <Link href={`/download/${release.version}`} className={buttonClass()}>
                <DownloadIcon className="h-4 w-4" />
                Download v{release.version}
              </Link>
            ) : null}
            <a
              href={isPublished ? `${GITHUB_URL}/releases/tag/${tag}` : DOCS.changelog}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'secondary' })}
            >
              <ExternalIcon className="h-4 w-4" />
              {isPublished ? 'GitHub release' : 'CHANGELOG.md'}
            </a>
            {isPublished && (
              <a
                href={`${GITHUB_URL}/tree/${tag}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'secondary' })}
              >
                <CodeIcon className="h-4 w-4" />
                Browse code at {tag}
              </a>
            )}
          </div>
        </Reveal>

        {comparison && (
          <Reveal>
            <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: 'Commits',
                  value: numberFormat.format(comparison.commits.length),
                },
                {
                  label: 'Pull requests',
                  value: numberFormat.format(comparison.pullRequests.length),
                },
                {
                  label: 'Files changed',
                  value: numberFormat.format(comparison.filesChanged),
                },
                {
                  label: 'Lines',
                  value: `+${numberFormat.format(comparison.additions)} −${numberFormat.format(comparison.deletions)}`,
                },
              ].map((stat) => (
                <div key={stat.label} className="orbit-glass rounded-[18px] p-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                    {stat.label}
                  </dt>
                  <dd className="mt-2 text-2xl font-medium tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        )}

        {notes && notes.highlights.length > 0 && (
          <section aria-labelledby="highlights" className="mt-16">
            <h2
              id="highlights"
              className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl"
            >
              Highlights
            </h2>
            <ul className="mt-6 grid gap-4 md:grid-cols-2">
              {notes.highlights.map((item, itemIndex) => (
                <ChangeItemView key={itemIndex} item={item} />
              ))}
            </ul>
          </section>
        )}

        {sections.map((section) => {
          const Icon = SECTION_ICONS[section.kind]
          const id = `section-${section.kind}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          return (
            <section key={section.heading} aria-labelledby={id} className="mt-16">
              <h2
                id={id}
                className="flex items-center gap-3 text-2xl font-medium tracking-[-0.03em] sm:text-3xl"
              >
                <span className="orbit-btn-fire flex h-9 w-9 items-center justify-center rounded-full">
                  <Icon className="h-4 w-4" />
                </span>
                {section.kind === 'other'
                  ? section.heading
                  : SECTION_LABELS[section.kind]}
                <span className="font-mono text-sm text-white/40">
                  {section.items.length}
                </span>
              </h2>
              <ul className="mt-6 space-y-4">
                {section.items.map((item, itemIndex) => (
                  <ChangeItemView key={itemIndex} item={item} />
                ))}
              </ul>
            </section>
          )
        })}

        <section aria-labelledby="code" className="mt-16">
          <h2 id="code" className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            The code behind it
          </h2>
          {comparison ? (
            <>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Every commit between v{previous?.version} and v{release.version}.{' '}
                <a
                  href={comparison.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orbit-accent hover:text-orbit-focus"
                >
                  Open the full diff on GitHub
                </a>
                .
              </p>
              <div className="mt-6">
                <CommitList commits={comparison.commits} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-white/65">
              {isPublished
                ? 'The commit list is not available right now. '
                : 'This version was not published as a GitHub release, so there is no tag to compare. '}
              <a
                href={
                  isPublished ? `${GITHUB_URL}/tree/${tag}` : `${GITHUB_URL}/commits/main`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-orbit-accent hover:text-orbit-focus"
              >
                {isPublished ? `Browse the code at ${tag}` : 'Browse the commit history'}
              </a>
              .
            </p>
          )}
        </section>

        <div className="orbit-glass mt-16 rounded-[24px] p-6 sm:p-8">
          <ShareBar
            url={url}
            title={`Orbit v${release.version} is here`}
            label="Share this release"
          />
        </div>

        <nav aria-label="Other releases" className="mt-10 grid gap-4 sm:grid-cols-2">
          {older ? (
            <Link
              href={`/changelog/${older.version}`}
              className="orbit-glass rounded-[20px] p-5 transition hover:-translate-y-0.5"
            >
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                <ArrowLeftIcon className="h-3.5 w-3.5" /> Older
              </span>
              <span className="mt-2 block text-lg text-orbit-foreground">
                v{older.version}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link
              href={`/changelog/${newer.version}`}
              className="orbit-glass rounded-[20px] p-5 text-right transition hover:-translate-y-0.5"
            >
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">
                Newer <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
              <span className="mt-2 block text-lg text-orbit-foreground">
                v{newer.version}
              </span>
            </Link>
          )}
        </nav>
      </div>
    </article>
  )
}
