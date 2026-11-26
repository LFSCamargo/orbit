import { SECTION_LABELS, type ChangelogRelease } from '@/lib/changelog'
import { renderOgCard, shorten } from './card'

/** "Orbit vX is here." with the release's summary and the kinds of change it
 * carries, as in the changelog social card. */
export function changelogCard(release: ChangelogRelease | undefined) {
  if (!release) {
    return renderOgCard({
      variant: 'changelog',
      eyebrow: 'Changelog',
      title: [[{ text: 'Every release,' }], [{ text: 'explained.', highlight: true }]],
      subtitle: 'What changed in each version of Orbit, and the code behind it.',
    })
  }
  const summary = release.summary.replace(/`/g, '')
  return renderOgCard({
    variant: 'changelog',
    eyebrow: 'Changelog',
    title: [
      [
        { text: 'Orbit ' },
        { text: `v${release.version}`, highlight: true },
        { text: ' is here.' },
      ],
    ],
    subtitle: summary ? shorten(summary, 110) : undefined,
    badges: [
      { label: `v${release.version}`, emphasis: true },
      ...release.sections
        .filter((section) => section.kind !== 'other')
        .slice(0, 3)
        .map((section) => ({ label: SECTION_LABELS[section.kind], check: true })),
    ],
  })
}
