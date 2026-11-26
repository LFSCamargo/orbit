import type { Metadata } from 'next'
import Link from 'next/link'
import { InlineCodeText } from '@/components/changelog/InlineCodeText'
import { SectionPills } from '@/components/changelog/SectionPills'
import { PageHero } from '@/components/layout/PageHero'
import { ArrowRightIcon, BoltIcon } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/reveal'
import { countItems } from '@/lib/changelog'
import { getChangelog } from '@/lib/changelogSource'
import { formatReleaseDate } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { DOCS } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Changelog',
  description:
    'Every Orbit release, explained: new features, improvements and fixes, with links to the commits and pull requests behind each change.',
  path: '/changelog',
})

export default async function ChangelogPage() {
  const releases = await getChangelog()
  const [latest, ...older] = releases

  return (
    <>
      <PageHero
        eyebrow="Changelog"
        icon={<BoltIcon className="h-4 w-4" />}
        title="Every release,"
        highlight="explained."
        description={
          <>
            What changed in each version of Orbit, why it matters, and the code behind it.
            The raw list lives in{' '}
            <a href={DOCS.changelog} className="text-orbit-accent hover:text-orbit-focus">
              CHANGELOG.md
            </a>
            .
          </>
        }
      />

      <div className="mx-auto max-w-5xl px-6 pb-24 pt-12">
        {!latest ? (
          <p className="text-orbit-muted">The changelog is not available right now.</p>
        ) : (
          <>
            <Reveal>
              <Link
                href={`/changelog/${latest.version}`}
                className="orbit-glass group relative block overflow-hidden rounded-[28px] p-8 transition hover:-translate-y-1 sm:p-10"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-32 -right-10 h-64 w-[70%] rounded-[100%] bg-[radial-gradient(50%_50%,rgb(255_120_50/0.35),transparent)] blur-2xl"
                />
                <p className="relative font-mono text-[11px] uppercase tracking-[0.2em] text-orbit-accent">
                  Latest release · {formatReleaseDate(latest.date)}
                </p>
                <h2 className="relative mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
                  Orbit <span className="fire-text">v{latest.version}</span> is here.
                </h2>
                {latest.summary && (
                  <p className="relative mt-4 max-w-2xl text-base leading-7 text-white/70">
                    <InlineCodeText text={latest.summary} />
                  </p>
                )}
                <SectionPills
                  version={latest.version}
                  sections={latest.sections}
                  className="relative mt-6"
                />
                <span className="relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-orbit-accent">
                  See what changed
                  <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>

            <ol className="relative mt-14 space-y-6 border-l border-white/10 pl-8 sm:ml-4">
              {older.map((release) => (
                <li key={release.version} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[38px] top-6 h-3 w-3 rounded-full bg-orange-400 shadow-[0_0_0_4px_rgb(8_8_9),0_0_16px_2px_rgb(255_120_40/0.7)]"
                  />
                  <Reveal>
                    <Link
                      href={`/changelog/${release.version}`}
                      className="orbit-glass group block rounded-[22px] p-6 transition hover:-translate-y-0.5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <h2 className="text-2xl font-medium tracking-[-0.03em]">
                          v{release.version}
                        </h2>
                        <time
                          dateTime={release.date ?? undefined}
                          className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50"
                        >
                          {formatReleaseDate(release.date)}
                        </time>
                      </div>
                      {release.summary && (
                        <p className="mt-2 text-sm leading-6 text-white/65">
                          <InlineCodeText text={release.summary} />
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <SectionPills sections={release.sections} />
                        <span className="inline-flex items-center gap-1.5 text-sm text-white/55 group-hover:text-orbit-accent">
                          {countItems(release)} changes
                          <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-1" />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  )
}
