/** Keep-a-Changelog parsing for CHANGELOG.md and the per-release notes in
 * .github/release-notes/. Pure, so it runs the same in tests and at build. */

export type SectionKind = 'added' | 'changed' | 'fixed' | 'removed' | 'other'

export interface ChangeItem {
  /** Bold lead-in ("**Title** — body"), when the entry has one. */
  title: string | null
  /** Markdown explanation. */
  body: string
  /** Inline `code` identifiers mentioned, for "find in code" links. */
  code: string[]
}

export interface ChangeSection {
  kind: SectionKind
  heading: string
  items: ChangeItem[]
}

export interface ChangelogRelease {
  version: string
  date: string | null
  summary: string
  sections: ChangeSection[]
}

export interface ReleaseNotes {
  highlights: ChangeItem[]
  sections: ChangeSection[]
}

/** How a section reads to people, as on the release cards. */
export const SECTION_LABELS: Record<SectionKind, string> = {
  added: 'New features',
  changed: 'Improvements',
  fixed: 'Fixes',
  removed: 'Removed',
  other: 'Other changes',
}

const SECTION_ORDER: SectionKind[] = ['added', 'changed', 'fixed', 'removed', 'other']

const VERSION_HEADING =
  /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S+/

function sectionKind(heading: string): SectionKind {
  const key = heading.trim().toLowerCase()
  if (key === 'added') return 'added'
  if (key === 'changed') return 'changed'
  if (key === 'fixed') return 'fixed'
  if (key === 'removed') return 'removed'
  return 'other'
}

/** Unique inline-code spans, kept short enough to search for. */
export function codeTokens(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(/`([^`\n]{2,80})`/g)) {
    found.add(match[1].trim())
  }
  return [...found]
}

/** "**Title** — body", "**Title**: body" or a plain sentence. */
export function parseItem(raw: string): ChangeItem {
  const text = raw.trim()
  const lead = text.match(/^\*\*(.+?)\*\*\s*(?:[—–:-]\s*)?([\s\S]*)$/)
  if (lead && lead[2].trim()) {
    return { title: lead[1].trim(), body: lead[2].trim(), code: codeTokens(text) }
  }
  return { title: null, body: text, code: codeTokens(text) }
}

/** Bullets ("- " or "* ") with indented continuation lines. */
function bullets(lines: string[]): string[] {
  const items: string[] = []
  for (const line of lines) {
    const bullet = line.match(/^\s{0,1}[-*]\s+(.*)$/)
    if (bullet) {
      items.push(bullet[1])
    } else if (items.length && /^\s{2,}\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`
    }
  }
  return items
}

function sortSections(sections: ChangeSection[]): ChangeSection[] {
  return sections
    .filter((section) => section.items.length > 0)
    .sort((a, b) => SECTION_ORDER.indexOf(a.kind) - SECTION_ORDER.indexOf(b.kind))
}

/** `### Heading` blocks inside one release's lines. */
function parseSections(lines: string[]): { intro: string[]; sections: ChangeSection[] } {
  const intro: string[] = []
  const sections: ChangeSection[] = []
  let current: { heading: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    sections.push({
      kind: sectionKind(current.heading),
      heading: current.heading,
      items: bullets(current.lines).map(parseItem),
    })
  }
  for (const line of lines) {
    const heading = line.match(/^###\s+(.+)$/)
    if (heading) {
      flush()
      current = { heading: heading[1].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else {
      intro.push(line)
    }
  }
  flush()
  return { intro, sections: sortSections(sections) }
}

/** Every released version, newest first (as written). "Unreleased" is left out. */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: { version: string; date: string | null; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const { intro, sections } = parseSections(current.lines)
    const summary = intro
      .map((line) => line.trim())
      .filter((line) => line && !LINK_DEFINITION.test(line))
      .join(' ')
    releases.push({ version: current.version, date: current.date, summary, sections })
  }
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      flush()
      const match = line.match(VERSION_HEADING)
      current = match ? { version: match[1], date: match[2] ?? null, lines: [] } : null
      continue
    }
    if (current && !LINK_DEFINITION.test(line.trim())) current.lines.push(line)
  }
  flush()
  return releases
}

/** Highlights and the "What's new" sections of a GitHub release-notes file. */
export function parseReleaseNotes(markdown: string): ReleaseNotes {
  const blocks = new Map<string, string[]>()
  let current: string | null = null
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      current = heading[1].trim().toLowerCase()
      blocks.set(current, [])
    } else if (current) {
      blocks.get(current)?.push(line)
    }
  }
  const highlights = bullets(blocks.get('highlights') ?? []).map(parseItem)
  const whatsNew = [...blocks.entries()].find(([heading]) => heading.startsWith('what'))
  return { highlights, sections: whatsNew ? parseSections(whatsNew[1]).sections : [] }
}

export function countItems(release: ChangelogRelease): number {
  return release.sections.reduce((total, section) => total + section.items.length, 0)
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Only plain versions may name a file on disk. */
export function isVersion(value: string): boolean {
  return SEMVER.test(value)
}
