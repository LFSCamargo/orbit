/** Conventional Commit parsing for a release's commit list, so the changelog
 * can link every change to its code. */

export interface ReleaseCommit {
  sha: string
  shortSha: string
  type: string
  scope: string | null
  subject: string
  breaking: boolean
  pr: number | null
  url: string
}

export interface CommitGroup {
  type: string
  label: string
  commits: ReleaseCommit[]
}

const LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Performance',
  refactor: 'Refactors',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Maintenance',
  other: 'Other commits',
}

const ORDER = Object.keys(LABELS)

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

/** Splits `type(scope)!: subject (#12)`; anything else is an "other" commit. */
export function parseCommitMessage(
  message: string,
): Omit<ReleaseCommit, 'sha' | 'shortSha' | 'url'> {
  const firstLine = message.split(/\r?\n/)[0].trim()
  const prMatch =
    firstLine.match(/\(#(\d+)\)\s*$/) ?? firstLine.match(/^Merge pull request #(\d+)/)
  const pr = prMatch ? Number(prMatch[1]) : null
  const withoutPr = firstLine.replace(/\s*\(#\d+\)\s*$/, '')
  const match = withoutPr.match(CONVENTIONAL)
  if (!match) {
    return { type: 'other', scope: null, subject: withoutPr, breaking: false, pr }
  }
  const type = match[1].toLowerCase()
  return {
    type: type in LABELS ? type : 'other',
    scope: match[2] ?? null,
    subject: match[4],
    breaking: Boolean(match[3]) || /BREAKING CHANGE/.test(message),
    pr,
  }
}

export function isMergeCommit(message: string): boolean {
  return /^Merge (pull request|branch|remote-tracking)/.test(message)
}

/** Groups in a fixed order (features first), merge commits left out. */
export function groupCommits(commits: ReleaseCommit[]): CommitGroup[] {
  const groups = new Map<string, ReleaseCommit[]>()
  for (const commit of commits) {
    const list = groups.get(commit.type) ?? []
    list.push(commit)
    groups.set(commit.type, list)
  }
  return ORDER.filter((type) => groups.has(type)).map((type) => ({
    type,
    label: LABELS[type],
    commits: groups.get(type) ?? [],
  }))
}
